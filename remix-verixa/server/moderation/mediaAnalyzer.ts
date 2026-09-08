/**
 * VERIXA Media Safety Engine - Multimodal Visual & Temporal Analyzer
 *
 * Implements authoritative server-side moderation for:
 * - IMAGE: NSFW, nudity, sexual content, violence, blood/gore, weapons, suspicious synthetic/deepfake indicators
 * - GIF: frame extraction, representative frame analysis, risk aggregation
 * - VIDEO: frame extraction, scene change detection, representative frame analysis, deepfake evaluation, evidence retention
 *
 * Fail-closed: If AI is unavailable, never auto-approves. Content is placed into QUARANTINE with status REVIEW_REQUIRED.
 */

import { GoogleGenAI, Type } from '@google/genai';
import {
  ContentType,
  AnalysisResult,
  MediaInspectionScores,
  FrameModerationResult,
  GifAnalysisOutput,
  VideoAnalysisOutput,
} from './types';
import { NormalizedInput } from './normalizer';
import { extractGifFrames, bufferFromMediaContent } from './gifExtractor';
import {
  detectSceneChanges,
  aggregateVideoFrameRisks,
  InputVideoFrame,
} from './videoSafetyEngine';
import { evaluateSecondarySafety } from './secondarySafetyRules';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables dynamically
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const MEDIA_MODEL_NAME = 'gemini-3.1-flash-lite';
const FALLBACK_MEDIA_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];
const MODEL_VERSION = '2026.1';

/**
 * Initializes server-side Gemini client with User-Agent header
 */
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    dotenv.config();
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.error('Error initializing GoogleGenAI:', err);
    return null;
  }
}

/**
 * Resolves media content (URL or base64 data URL) to base64 and mime type
 */
export async function resolveMediaPayload(
  content: string,
  declaredMime?: string
): Promise<{ base64Data: string; mimeType: string } | null> {
  if (!content) return null;

  if (content.startsWith('data:')) {
    const match = content.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64Data: match[2] };
    }
  }

  // Raw base64 string
  if (!content.startsWith('http') && /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 100))) {
    return {
      mimeType: declaredMime || 'image/jpeg',
      base64Data: content,
    };
  }

  // Remote URL fetch
  if (content.startsWith('http://') || content.startsWith('https://')) {
    try {
      const res = await fetch(content);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return {
          mimeType: res.headers.get('content-type') || declaredMime || 'image/jpeg',
          base64Data: Buffer.from(buf).toString('base64'),
        };
      }
    } catch (err) {
      console.warn('Could not fetch remote media URL for analysis:', err);
    }
  }

  return null;
}

/**
 * Moderates a single image frame for:
 * - NSFW detection
 * - Nudity detection
 * - Sexual content detection
 * - Violence detection
 * - Blood / gore detection
 * - Weapons detection
 * - Suspicious synthetic / deepfake indicators
 */
export async function analyzeImageFrameWithAI(
  base64Data: string,
  mimeType: string = 'image/jpeg',
  options: {
    contentType?: ContentType;
    context?: string;
    timestamp?: number;
    frameIndex?: number;
    sceneId?: number;
  } = {}
): Promise<{
  safe: boolean;
  scores: MediaInspectionScores;
  labels: string[];
  reason: string;
  confidence: number;
  deepfake_indicators: string[];
  model: string;
}> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_CLIENT_UNAVAILABLE');
  }

  const isProfileAsset =
    options.contentType === 'profile_picture' || options.contentType === 'cover_photo';

  const systemInstruction = `You are VERIXA's Deep Vision & Synthetic Media Safety Engine.
Perform rigorous, multi-dimensional safety inspection on user-uploaded visual media.

Mandatory Safety Dimensions to Evaluate (0 to 100 score):
1. NSFW / Adult Content (nsfw_score): Explicit adult material, sexualized poses, lewd content.
2. Nudity (nudity_score): Exposed genitals, buttocks, female breasts. Partial vs. explicit nudity.
3. Sexual Content (sexual_score): Explicit sexual activity, suggestive bondage, fetish depictions.
4. Violence (violence_score): Physical assault, vehicular attacks, brawling, brutal altercations.
5. Blood & Gore (gore_score): Visceral trauma, open wounds, heavy bleeding, mutilation, surgical shock imagery.
6. Weapons (weapons_score): Firearms (pistols, rifles, assault weapons), bladed weapons (swords, daggers, machetes), explosives, tactical threatening displays.
7. Suspicious Synthetic / Deepfake Indicators (deepfake_risk_score):
   - Face boundary seam irregularities, mismatched lighting on face vs neck
   - Unnatural skin texture smoothing, hair boundary blending blur
   - Eye pupil asymmetry, distorted teeth or unnatural ear geometry
   - AI diffusion generation warping, spatial background inconsistencies
   - Unnatural temporal warping or face-swap blending artifacts
8. Embedded Text & OCR Inspection (embedded_text_toxicity_score, extracted_text):
   - You MUST read, transcribe, and inspect all visible text, typography, memes, screenshots of text, chat logs, signs, t-shirts, banners, and text overlays in the image across English, Hindi (native & Hinglish), Telugu (native & Tenglish), Tamil, and Urdu.
   - Extract all readable text into 'extracted_text' (use empty string "" if no text is present).
   - Evaluate 'embedded_text_toxicity_score' (0 to 100):
     * 75-100: Highly offensive, toxic, abusive, threatening, sexually harassing text, hate speech, zero-tolerance racial/religious/caste slurs, death threats, or obscene vulgarities.
     * 50-74: Moderately offensive text, targeted harassment, bullying, or abusive profanity.
     * 0-25: Safe or benign text (e.g. inspirational quotes, informational graphics, standard signage, coding snippets, benign brand logos, harmless jokes).
   - If offensive, abusive, hateful, threatening, or obscene text is present (embedded_text_toxicity_score >= 60):
     * You MUST set safe: false.
     * You MUST include 'Offensive Text in Image' in labels.
     * Include specific categories in labels (e.g. 'Hate speech', 'Harassment', 'Threats', 'Obscene language', 'Sexual harassment').
     * Explicitly detail in reason what offensive text was detected inside the image.

${isProfileAsset ? 'STRICT RULES FOR PROFILE/COVER ASSETS: Zero tolerance for nudity, weapons, graphic violence, synthetic deepfake impersonation, or offensive text.' : ''}

Be objective and accurate. Do not flag normal family photos, landscapes, artistic non-explicit photography, or benign tools (kitchen cutlery in cooking context).
Claim deepfake indicators ONLY if genuine synthetic anomalies are visually apparent.`;

  const promptText = `Inspect this ${options.contentType || 'image'} (context: ${options.context || 'feed upload'}) for:
1. NSFW, nudity, sexual content, violence, gore, weapons, and deepfake artifacts.
2. Embedded text, memes, typography, or overlays: extract all text into extracted_text and score its toxicity in embedded_text_toxicity_score. If offensive/toxic/abusive text is present, set safe=false.`;

  let lastError: any = null;

  for (const modelCandidate of FALLBACK_MEDIA_MODELS) {
    try {
      const timeoutMs = 12000;
      const apiCall = ai.models.generateContent({
        model: modelCandidate,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              safe: { type: Type.BOOLEAN },
              nsfw_score: { type: Type.INTEGER },
              nudity_score: { type: Type.INTEGER },
              sexual_score: { type: Type.INTEGER },
              violence_score: { type: Type.INTEGER },
              gore_score: { type: Type.INTEGER },
              weapons_score: { type: Type.INTEGER },
              deepfake_risk_score: { type: Type.INTEGER },
              embedded_text_toxicity_score: { type: Type.INTEGER },
              extracted_text: { type: Type.STRING },
              overall_risk_score: { type: Type.INTEGER },
              confidence: { type: Type.INTEGER },
              labels: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              deepfake_indicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              reason: { type: Type.STRING },
            },
            required: [
              'safe',
              'nsfw_score',
              'nudity_score',
              'sexual_score',
              'violence_score',
              'gore_score',
              'weapons_score',
              'deepfake_risk_score',
              'embedded_text_toxicity_score',
              'extracted_text',
              'overall_risk_score',
              'confidence',
              'labels',
              'reason',
            ],
          },
        },
      });

      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Model ${modelCandidate} timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([apiCall, timer]);

      const parsed = JSON.parse(response.text || '{}');

      const extractedText = typeof parsed.extracted_text === 'string' ? parsed.extracted_text.trim() : '';
      let embeddedTextToxicity = typeof parsed.embedded_text_toxicity_score === 'number' ? parsed.embedded_text_toxicity_score : 0;

      // Defense-in-depth: Evaluate secondary deterministic safety rules on extracted OCR text
      let secondaryHitReason: string | null = null;
      let secondaryHitCategory: string | null = null;

      if (extractedText) {
        const secondaryHit = evaluateSecondarySafety(extractedText);
        if (secondaryHit.matched) {
          embeddedTextToxicity = Math.max(embeddedTextToxicity, secondaryHit.toxicityScore || 95);
          secondaryHitReason = secondaryHit.reason || `Detected ${secondaryHit.category || 'abusive text'} in image.`;
          secondaryHitCategory = secondaryHit.category || 'Offensive Text in Image';
        }
      }

      const isTextToxic = embeddedTextToxicity >= (isProfileAsset ? 35 : 60);

      const computedOverallRisk = Math.max(
        parsed.overall_risk_score ?? 0,
        parsed.nsfw_score ?? 0,
        parsed.violence_score ?? 0,
        parsed.weapons_score ?? 0,
        parsed.deepfake_risk_score ?? 0,
        embeddedTextToxicity
      );

      const finalSafe = Boolean(parsed.safe) && !isTextToxic && !secondaryHitReason;

      const scores: MediaInspectionScores = {
        nsfw: parsed.nsfw_score ?? 0,
        nudity: parsed.nudity_score ?? 0,
        sexual_content: parsed.sexual_score ?? 0,
        violence: parsed.violence_score ?? 0,
        blood_gore: parsed.gore_score ?? 0,
        weapons: parsed.weapons_score ?? 0,
        deepfake_risk: parsed.deepfake_risk_score ?? 0,
        embedded_text_toxicity: embeddedTextToxicity,
        extracted_text: extractedText,
        overall_risk: computedOverallRisk,
        risk: computedOverallRisk,
      };

      const labelsSet = new Set<string>();
      if (Array.isArray(parsed.labels)) {
        for (const l of parsed.labels) {
          if (l && l !== 'Safe content') labelsSet.add(l);
        }
      }

      if (isTextToxic || secondaryHitReason) {
        labelsSet.add('Offensive Text in Image');
        if (secondaryHitCategory) {
          labelsSet.add(secondaryHitCategory);
        }
      }

      let finalReason = parsed.reason || '';
      if (secondaryHitReason) {
        finalReason = `Image blocked: ${secondaryHitReason}`;
      } else if (isTextToxic && (!finalReason || parsed.safe)) {
        finalReason = `Image contains offensive or toxic text: "${extractedText.slice(0, 80)}"`;
      } else if (!finalReason) {
        finalReason = finalSafe ? 'Visual content verified safe.' : 'Visual content violated safety rules.';
      }

      const labels = labelsSet.size > 0
        ? Array.from(labelsSet)
        : (finalSafe ? ['Safe content'] : ['Flagged Media']);

      const deepfakeIndicators = Array.isArray(parsed.deepfake_indicators)
        ? parsed.deepfake_indicators
        : [];

      return {
        safe: finalSafe,
        scores,
        labels,
        reason: finalReason,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 95,
        deepfake_indicators: deepfakeIndicators,
        model: modelCandidate,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`Media model candidate ${modelCandidate} failed:`, err?.message);
    }
  }

  throw lastError || new Error('All vision moderation models failed');
}

/**
 * Moderates GIF media:
 * 1. Extracts frames using pure-TS GIF parser
 * 2. Analyzes representative frames
 * 3. Aggregates results
 */
export async function analyzeGifMedia(
  rawContent: string,
  declaredMime?: string
): Promise<AnalysisResult> {
  const analysisId = `mod_gif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const resolved = await resolveMediaPayload(rawContent, declaredMime);
  if (!resolved) {
    return {
      language: 'Visual',
      categories: ['MEDIA_UNREACHABLE', 'PENDING_REVIEW'],
      toxicity_score: 50,
      confidence: 50,
      risk_score: 50,
      reason: 'Could not access or decode GIF media. Held in quarantine for review.',
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      is_failure: true,
      failure_reason: 'MEDIA_RESOLVE_FAILED',
    };
  }

  const buf = Buffer.from(resolved.base64Data, 'base64');
  const gifParse = extractGifFrames(buf, 4);

  if (!gifParse.isGif || gifParse.frames.length === 0) {
    // If not a valid multi-frame GIF, inspect as single image
    return analyzeImageMedia(rawContent, 'image/gif', 'gif');
  }

  const frameResults: FrameModerationResult[] = [];
  let usedModel = MEDIA_MODEL_NAME;

  try {
    for (let i = 0; i < gifParse.frames.length; i++) {
      const frame = gifParse.frames[i];
      const frameComma = frame.dataUrl.indexOf(',');
      const frameB64 = frame.dataUrl.slice(frameComma + 1);

      const frameAnalysis = await analyzeImageFrameWithAI(frameB64, 'image/gif', {
        contentType: 'gif',
        context: `GIF representative frame ${i + 1}/${gifParse.frames.length}`,
        frameIndex: frame.index,
        timestamp: (frame.index * frame.delayMs) / 1000,
      });

      usedModel = frameAnalysis.model;

      frameResults.push({
        timestamp: (frame.index * frame.delayMs) / 1000,
        frame_index: frame.index,
        scene_id: 1,
        scores: frameAnalysis.scores,
        labels: frameAnalysis.labels,
        safe: frameAnalysis.safe,
        reason: frameAnalysis.reason,
        deepfake_indicators: frameAnalysis.deepfake_indicators,
      });
    }

    // Aggregate across representative frames
    let maxOverallRisk = 0;
    let maxNsfw = 0;
    let maxViolence = 0;
    let maxWeapons = 0;
    let maxDeepfake = 0;
    let maxEmbeddedTextToxicity = 0;
    let combinedExtractedText = '';
    const aggregatedLabels = new Set<string>();

    for (const fr of frameResults) {
      const s = fr.scores;
      maxOverallRisk = Math.max(maxOverallRisk, s.overall_risk ?? 0);
      maxNsfw = Math.max(maxNsfw, s.nsfw ?? 0);
      maxViolence = Math.max(maxViolence, s.violence ?? 0);
      maxWeapons = Math.max(maxWeapons, s.weapons ?? 0);
      maxDeepfake = Math.max(maxDeepfake, s.deepfake_risk ?? 0);
      maxEmbeddedTextToxicity = Math.max(maxEmbeddedTextToxicity, s.embedded_text_toxicity ?? 0);

      if (s.extracted_text && !combinedExtractedText.includes(s.extracted_text)) {
        combinedExtractedText = combinedExtractedText ? `${combinedExtractedText} | ${s.extracted_text}` : s.extracted_text;
      }

      for (const label of fr.labels) {
        if (label !== 'Safe content') {
          aggregatedLabels.add(label);
        }
      }
    }

    const isSafe = maxOverallRisk < 60 && maxEmbeddedTextToxicity < 60 && aggregatedLabels.size === 0;
    const labels = aggregatedLabels.size > 0 ? Array.from(aggregatedLabels) : ['Safe content'];

    const gifOutput: GifAnalysisOutput = {
      total_frames: gifParse.totalFrames,
      frames_analyzed: frameResults.length,
      frame_results: frameResults,
      scores: {
        overall_risk: maxOverallRisk,
        risk: maxOverallRisk,
        nsfw: maxNsfw,
        violence: maxViolence,
        weapons: maxWeapons,
        deepfake_risk: maxDeepfake,
        embedded_text_toxicity: maxEmbeddedTextToxicity,
        extracted_text: combinedExtractedText,
      },
      labels,
      overall_risk: maxOverallRisk,
      safe: isSafe,
      reason: isSafe
        ? `GIF verified safe across ${gifParse.totalFrames} total frames (${frameResults.length} representative frames analyzed).`
        : `GIF flagged for safety violations (${labels[0] || 'Violations Detected'}).`,
      model: usedModel,
      model_version: MODEL_VERSION,
    };

    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: labels,
      toxicity_score: Math.max(maxNsfw, maxViolence, maxWeapons, maxEmbeddedTextToxicity),
      confidence: 95,
      risk_score: maxOverallRisk,
      reason: gifOutput.reason,
      safe_rewrite: null,
      model: usedModel,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      scores: gifOutput.scores,
      labels,
      deepfake_risk: maxDeepfake,
      gif_analysis: gifOutput,
    };
  } catch (err: any) {
    console.error('GIF analysis error:', err.message);
    // FAIL-CLOSED: Return QUARANTINE / REVIEW_REQUIRED
    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: ['AI_UNAVAILABLE', 'PENDING_REVIEW'],
      toxicity_score: 50,
      confidence: 50,
      risk_score: 50,
      reason: 'AI GIF moderation service unavailable or encountered an error. Placed in quarantine for safety review.',
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      is_failure: true,
      failure_reason: err.message || 'GIF_ANALYSIS_FAILED',
    };
  }
}

/**
 * Moderates Video media (Videos and Reels):
 * 1. Ingests video / extracted frames
 * 2. Detects scene changes
 * 3. Analyzes representative frames from each scene
 * 4. Aggregates frame-level risks
 * 5. Returns overall video risk and retains evidence references
 */
export async function analyzeVideoMedia(
  rawContent: string,
  declaredMime: string = 'video/mp4',
  options: {
    frames?: Array<{ timestamp: number; data: string }>;
    intervalSeconds?: number;
    contentType?: ContentType;
    contentId?: string;
  } = {}
): Promise<AnalysisResult> {
  const analysisId = `mod_vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const inputFrames: InputVideoFrame[] = options.frames || [];

  const ai = getGeminiClient();
  if (!ai) {
    // FAIL-CLOSED: When AI is unconfigured or unavailable, content must become REVIEW_REQUIRED / QUARANTINED
    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: ['AI_UNAVAILABLE', 'PENDING_REVIEW'],
      toxicity_score: 50,
      confidence: 50,
      risk_score: 50,
      reason: 'AI video moderation engine is unconfigured or unavailable. Video placed in quarantine for safety review.',
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      is_failure: true,
      failure_reason: 'GEMINI_CLIENT_UNAVAILABLE',
    };
  }

  try {
    // If frames were extracted at configurable intervals:
    if (inputFrames.length > 0) {
      // 1. Scene Change Detection
      const { scenes, keyframeIndices } = detectSceneChanges(inputFrames, 0.32);

      // 2. Select representative keyframes to inspect
      const framesToAnalyze: InputVideoFrame[] = [];
      for (const idx of keyframeIndices) {
        if (inputFrames[idx]) {
          framesToAnalyze.push(inputFrames[idx]);
        }
      }

      // Cap at 8 representative keyframes for performance while maintaining thoroughness
      const sampledFrames = framesToAnalyze.slice(0, 8);
      const frameResults: FrameModerationResult[] = [];
      let usedModel = MEDIA_MODEL_NAME;

      for (let i = 0; i < sampledFrames.length; i++) {
        const frame = sampledFrames[i];
        let frameB64 = frame.data;
        if (frameB64.startsWith('data:')) {
          frameB64 = frameB64.slice(frameB64.indexOf(',') + 1);
        }

        const sceneId = scenes.find((s) => frame.timestamp >= s.start_timestamp && frame.timestamp <= s.end_timestamp)?.scene_id || 1;

        const frameAnalysis = await analyzeImageFrameWithAI(frameB64, 'image/jpeg', {
          contentType: options.contentType || 'video',
          context: `Video keyframe at ${frame.timestamp}s (Scene ${sceneId})`,
          timestamp: frame.timestamp,
          frameIndex: i,
          sceneId,
        });

        usedModel = frameAnalysis.model;

        frameResults.push({
          timestamp: frame.timestamp,
          frame_index: i,
          scene_id: sceneId,
          scores: frameAnalysis.scores,
          labels: frameAnalysis.labels,
          safe: frameAnalysis.safe,
          reason: frameAnalysis.reason,
          deepfake_indicators: frameAnalysis.deepfake_indicators,
        });
      }

      // 3. Aggregate frame-level risk and retain evidence references
      const videoOutput = aggregateVideoFrameRisks(
        frameResults,
        scenes,
        usedModel,
        MODEL_VERSION
      );

      return {
        language: 'Visual',
        language_detected: 'Visual',
        categories: videoOutput.labels,
        toxicity_score: Math.max(
          videoOutput.scores.nsfw ?? 0,
          videoOutput.scores.violence ?? 0,
          videoOutput.scores.weapons ?? 0,
          videoOutput.scores.embedded_text_toxicity ?? 0
        ),
        confidence: 95,
        risk_score: videoOutput.overall_risk,
        reason: videoOutput.reason,
        safe_rewrite: null,
        model: usedModel,
        model_version: MODEL_VERSION,
        analysis_id: analysisId,
        scores: videoOutput.scores,
        labels: videoOutput.labels,
        deepfake_risk: videoOutput.deepfake_risk,
        video_analysis: videoOutput,
        evidence_references: videoOutput.evidence_references,
      };
    }

    // Direct Video Payload Analysis (if video data/URL provided without client frame extraction)
    const resolved = await resolveMediaPayload(rawContent, declaredMime);
    if (!resolved) {
      return {
        language: 'Visual',
        categories: ['MEDIA_UNREACHABLE', 'PENDING_REVIEW'],
        toxicity_score: 50,
        confidence: 50,
        risk_score: 50,
        reason: 'Could not access or decode video media. Placed in quarantine for safety review.',
        safe_rewrite: null,
        model: MEDIA_MODEL_NAME,
        model_version: MODEL_VERSION,
        analysis_id: analysisId,
        is_failure: true,
        failure_reason: 'VIDEO_RESOLVE_FAILED',
      };
    }

    // Direct multimodal video call
    const promptText = `Analyze this video for safety compliance on VERIXA.
Inspect across the video timeline for:
1. Adult / NSFW / sexually explicit content
2. Graphic violence, blood, or weapons
3. Suspicious synthetic / deepfake indicators and face artifacts
4. Harassment, shock imagery, or offensive/abusive/toxic on-screen text or captions`;

    const response = await ai.models.generateContent({
      model: MEDIA_MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              data: resolved.base64Data,
              mimeType: resolved.mimeType,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            nsfw_score: { type: Type.INTEGER },
            violence_score: { type: Type.INTEGER },
            weapons_score: { type: Type.INTEGER },
            deepfake_risk_score: { type: Type.INTEGER },
            embedded_text_toxicity_score: { type: Type.INTEGER },
            overall_risk_score: { type: Type.INTEGER },
            labels: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            reason: { type: Type.STRING },
          },
          required: ['safe', 'nsfw_score', 'violence_score', 'weapons_score', 'deepfake_risk_score', 'embedded_text_toxicity_score', 'overall_risk_score', 'labels', 'reason'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const textToxicity = parsed.embedded_text_toxicity_score ?? 0;
    const overallRisk = parsed.overall_risk_score ?? (parsed.safe ? 5 : 85);
    const deepfakeRisk = parsed.deepfake_risk_score ?? (parsed.safe ? 5 : 75);

    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: Array.isArray(parsed.labels) && parsed.labels.length > 0 ? parsed.labels : [parsed.safe ? 'Safe content' : 'Flagged Media'],
      toxicity_score: Math.max(parsed.nsfw_score ?? 0, parsed.violence_score ?? 0, parsed.weapons_score ?? 0, textToxicity),
      confidence: 92,
      risk_score: overallRisk,
      reason: parsed.reason || (parsed.safe ? 'Video verified safe for publication.' : 'Video violates safety guidelines.'),
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      scores: {
        nsfw: parsed.nsfw_score ?? 0,
        violence: parsed.violence_score ?? 0,
        weapons: parsed.weapons_score ?? 0,
        deepfake_risk: deepfakeRisk,
        embedded_text_toxicity: textToxicity,
        overall_risk: overallRisk,
      },
      labels: parsed.labels || [parsed.safe ? 'Safe content' : 'Flagged Media'],
      deepfake_risk: deepfakeRisk,
    };
  } catch (err: any) {
    console.error('Video moderation error:', err.message);
    // FAIL-CLOSED: Return QUARANTINE / REVIEW_REQUIRED
    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: ['VIDEO_SCAN_ERROR', 'PENDING_REVIEW'],
      toxicity_score: 50,
      confidence: 50,
      risk_score: 50,
      reason: 'Video safety audit encountered an error or timeout. Placed in quarantine pending human review.',
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      is_failure: true,
      failure_reason: err.message || 'VIDEO_ANALYSIS_FAILED',
    };
  }
}

/**
 * Moderates Image media (Images, Profile Pictures, Cover Photos, Story Images):
 */
export async function analyzeImageMedia(
  rawContent: string,
  declaredMime: string = 'image/jpeg',
  contentType: ContentType = 'image'
): Promise<AnalysisResult> {
  const analysisId = `mod_img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const resolved = await resolveMediaPayload(rawContent, declaredMime);
  if (!resolved) {
    return {
      language: 'Visual',
      categories: ['MEDIA_UNREACHABLE', 'PENDING_REVIEW'],
      toxicity_score: 50,
      confidence: 50,
      risk_score: 50,
      reason: 'Could not fetch or decode image media for safety inspection. Held in quarantine for review.',
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      is_failure: true,
      failure_reason: 'IMAGE_RESOLVE_FAILED',
    };
  }

  try {
    const frameAnalysis = await analyzeImageFrameWithAI(
      resolved.base64Data,
      resolved.mimeType,
      {
        contentType,
        context: `${contentType} safety check`,
      }
    );

    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: frameAnalysis.labels,
      toxicity_score: Math.max(
        frameAnalysis.scores.nsfw ?? 0,
        frameAnalysis.scores.violence ?? 0,
        frameAnalysis.scores.weapons ?? 0,
        frameAnalysis.scores.embedded_text_toxicity ?? 0
      ),
      confidence: frameAnalysis.confidence,
      risk_score: frameAnalysis.scores.overall_risk ?? 0,
      reason: frameAnalysis.reason,
      safe_rewrite: null,
      model: frameAnalysis.model,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      scores: frameAnalysis.scores,
      labels: frameAnalysis.labels,
      deepfake_risk: frameAnalysis.scores.deepfake_risk ?? 0,
    };
  } catch (err: any) {
    console.error('Image analysis error:', err.message);
    // FAIL-CLOSED: Return QUARANTINE / REVIEW_REQUIRED
    return {
      language: 'Visual',
      language_detected: 'Visual',
      categories: ['MEDIA_SCAN_ERROR', 'PENDING_REVIEW'],
      toxicity_score: 50,
      confidence: 50,
      risk_score: 50,
      reason: 'AI visual moderation service unavailable. Content placed in quarantine for safety review.',
      safe_rewrite: null,
      model: MEDIA_MODEL_NAME,
      model_version: MODEL_VERSION,
      analysis_id: analysisId,
      is_failure: true,
      failure_reason: err.message || 'IMAGE_ANALYSIS_FAILED',
    };
  }
}

/**
 * Main Media Safety Engine entry point:
 * Dispatches to Image, GIF, or Video engines
 */
export async function executeMediaSafetyAnalysis(
  normalizedInput: NormalizedInput,
  mimeType?: string,
  context?: string,
  options?: {
    frames?: Array<{ timestamp: number; data: string }>;
    intervalSeconds?: number;
    contentId?: string;
  }
): Promise<AnalysisResult> {
  const { rawContent, contentType } = normalizedInput;
  const effectiveMime = mimeType || (contentType === 'gif' ? 'image/gif' : (contentType === 'video' || contentType === 'reel' ? 'video/mp4' : 'image/jpeg'));

  if (contentType === 'gif' || effectiveMime.includes('gif') || rawContent.toLowerCase().includes('.gif')) {
    return analyzeGifMedia(rawContent, effectiveMime);
  }

  if (contentType === 'video' || contentType === 'reel' || effectiveMime.startsWith('video/')) {
    return analyzeVideoMedia(rawContent, effectiveMime, {
      frames: options?.frames,
      intervalSeconds: options?.intervalSeconds,
      contentType,
      contentId: options?.contentId,
    });
  }

  return analyzeImageMedia(rawContent, effectiveMime, contentType);
}
