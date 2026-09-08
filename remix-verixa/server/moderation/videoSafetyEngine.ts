/**
 * VERIXA Video Safety Engine
 *
 * Implements:
 * - Secure video input ingestion & validation
 * - Configurable interval frame processing
 * - Inter-frame scene change detection
 * - Representative frame safety & deepfake indicator analysis
 * - Frame-level risk aggregation
 * - Retaining evidence references rather than unnecessary raw media
 */

import {
  VideoEvidenceReference,
  FrameModerationResult,
  SceneChangeInfo,
  VideoAnalysisOutput,
  MediaInspectionScores,
} from './types';

/**
 * Validates video magic bytes for standard web video formats (MP4, WebM, QuickTime)
 */
export function validateVideoMagicBytes(buffer: Buffer): { valid: boolean; format?: string; error?: string } {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'Video payload too small or empty.' };
  }

  // 1. MP4 / ISO Base Media: Look for 'ftyp' at offset 4
  const ftypTag = buffer.toString('ascii', 4, 8);
  if (ftypTag === 'ftyp') {
    const majorBrand = buffer.toString('ascii', 8, 12);
    return { valid: true, format: `mp4 (${majorBrand.trim()})` };
  }

  // 2. WebM / Matroska: Magic bytes 0x1A 0x45 0xDF 0xA3 at offset 0
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { valid: true, format: 'webm' };
  }

  // 3. QuickTime 'moov' or 'wide' at offset 4
  const qtTag = buffer.toString('ascii', 4, 8);
  if (qtTag === 'moov' || qtTag === 'wide' || qtTag === 'mdat') {
    return { valid: true, format: 'quicktime' };
  }

  return { valid: false, error: 'Unrecognized or invalid video format magic header.' };
}

/**
 * Computes a normalized color histogram for an image buffer (base64 or buffer)
 * to perform inter-frame difference and scene change detection.
 */
export function computeFrameHistogram(buffer: Buffer): Float32Array {
  // 64-bin luminance / color histogram
  const bins = new Float32Array(64);
  const sampleStep = Math.max(1, Math.floor(buffer.length / 4096));
  let count = 0;

  for (let i = 0; i < buffer.length; i += sampleStep) {
    const val = buffer[i];
    const binIdx = Math.min(63, Math.floor((val / 256) * 64));
    bins[binIdx]++;
    count++;
  }

  if (count > 0) {
    for (let i = 0; i < 64; i++) {
      bins[i] /= count;
    }
  }

  return bins;
}

/**
 * Computes Euclidean distance between two frame histograms (0.0 = identical, 1.0 = maximum difference)
 */
export function computeHistogramDistance(histA: Float32Array, histB: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < histA.length; i++) {
    const diff = histA[i] - histB[i];
    sumSq += diff * diff;
  }
  return Math.min(1, Math.sqrt(sumSq) * 1.5);
}

export interface InputVideoFrame {
  timestamp: number; // in seconds
  data: string; // base64 data URL or raw base64
}

/**
 * Detects scene changes across a sequence of extracted video frames.
 * Returns detected scenes and keyframe indices.
 */
export function detectSceneChanges(
  frames: InputVideoFrame[],
  threshold: number = 0.32
): { scenes: SceneChangeInfo[]; keyframeIndices: number[] } {
  if (frames.length === 0) {
    return { scenes: [], keyframeIndices: [] };
  }

  if (frames.length === 1) {
    return {
      scenes: [
        {
          scene_id: 1,
          start_timestamp: frames[0].timestamp,
          end_timestamp: frames[0].timestamp,
          keyframe_timestamp: frames[0].timestamp,
          difference_score: 0,
        },
      ],
      keyframeIndices: [0],
    };
  }

  const histograms: Float32Array[] = [];
  for (const f of frames) {
    let buf: Buffer;
    if (f.data.startsWith('data:')) {
      const comma = f.data.indexOf(',');
      buf = Buffer.from(f.data.slice(comma + 1), 'base64');
    } else {
      buf = Buffer.from(f.data, 'base64');
    }
    histograms.push(computeFrameHistogram(buf));
  }

  const scenes: SceneChangeInfo[] = [];
  const keyframeIndices: number[] = [0]; // First frame is always a keyframe
  let currentSceneId = 1;
  let sceneStartTimestamp = frames[0].timestamp;
  let keyframeTimestamp = frames[0].timestamp;

  for (let i = 1; i < frames.length; i++) {
    const dist = computeHistogramDistance(histograms[i - 1], histograms[i]);
    const isSceneChange = dist >= threshold;

    if (isSceneChange) {
      scenes.push({
        scene_id: currentSceneId,
        start_timestamp: sceneStartTimestamp,
        end_timestamp: frames[i - 1].timestamp,
        keyframe_timestamp: keyframeTimestamp,
        difference_score: Math.round(dist * 100) / 100,
      });

      currentSceneId++;
      sceneStartTimestamp = frames[i].timestamp;
      keyframeTimestamp = frames[i].timestamp;
      keyframeIndices.push(i);
    }
  }

  // Close final scene
  scenes.push({
    scene_id: currentSceneId,
    start_timestamp: sceneStartTimestamp,
    end_timestamp: frames[frames.length - 1].timestamp,
    keyframe_timestamp: keyframeTimestamp,
    difference_score: 0,
  });

  return { scenes, keyframeIndices };
}

/**
 * Aggregates frame-level risks and retains evidence references
 */
export function aggregateVideoFrameRisks(
  frameResults: FrameModerationResult[],
  scenes: SceneChangeInfo[],
  modelName: string,
  modelVersion: string
): VideoAnalysisOutput {
  if (frameResults.length === 0) {
    return {
      frames_analyzed: 0,
      scenes_detected: 0,
      scene_changes: [],
      frame_results: [],
      evidence_references: [],
      scores: {
        toxicity: 0,
        risk: 0,
        nsfw: 0,
        violence: 0,
        weapons: 0,
        deepfake_risk: 0,
        overall_risk: 0,
      },
      labels: ['Safe content'],
      deepfake_risk: 0,
      overall_risk: 0,
      safe: true,
      reason: 'No video frames were provided for inspection.',
      model: modelName,
      model_version: modelVersion,
    };
  }

  let maxRisk = 0;
  let sumRisk = 0;
  let maxNsfw = 0;
  let maxNudity = 0;
  let maxSexual = 0;
  let maxViolence = 0;
  let maxGore = 0;
  let maxWeapons = 0;
  let maxDeepfake = 0;
  let maxEmbeddedTextToxicity = 0;
  let combinedExtractedText = '';

  const allLabels = new Set<string>();
  const evidenceReferences: VideoEvidenceReference[] = [];

  for (const fr of frameResults) {
    const s = fr.scores;
    const frRisk = s.overall_risk ?? s.risk ?? 0;
    maxRisk = Math.max(maxRisk, frRisk);
    sumRisk += frRisk;

    maxNsfw = Math.max(maxNsfw, s.nsfw ?? 0);
    maxNudity = Math.max(maxNudity, s.nudity ?? 0);
    maxSexual = Math.max(maxSexual, s.sexual_content ?? 0);
    maxViolence = Math.max(maxViolence, s.violence ?? 0);
    maxGore = Math.max(maxGore, s.blood_gore ?? 0);
    maxWeapons = Math.max(maxWeapons, s.weapons ?? 0);
    maxDeepfake = Math.max(maxDeepfake, s.deepfake_risk ?? 0);
    maxEmbeddedTextToxicity = Math.max(maxEmbeddedTextToxicity, s.embedded_text_toxicity ?? 0);

    if (s.extracted_text && !combinedExtractedText.includes(s.extracted_text)) {
      combinedExtractedText = combinedExtractedText ? `${combinedExtractedText} | ${s.extracted_text}` : s.extracted_text;
    }

    for (const label of fr.labels) {
      if (label && label !== 'Safe content' && label !== 'Safe Media') {
        allLabels.add(label);
      }
    }

    // Retain evidence references if frame has violations
    if (!fr.safe || frRisk >= 40 || (s.embedded_text_toxicity ?? 0) >= 50) {
      const topViolation = fr.labels.find((l) => l !== 'Safe content') || 'Suspicious Content';
      evidenceReferences.push({
        timestamp: fr.timestamp,
        frame_index: fr.frame_index,
        scene_id: fr.scene_id,
        violation_category: topViolation,
        violation_score: frRisk,
        description: fr.reason,
      });
    }
  }

  const avgRisk = sumRisk / frameResults.length;
  // Max pooling (70%) + weighted average (30%)
  const overallRisk = Math.round(maxRisk * 0.7 + avgRisk * 0.3);

  const aggregatedScores: MediaInspectionScores = {
    overall_risk: overallRisk,
    risk: overallRisk,
    nsfw: maxNsfw,
    nudity: maxNudity,
    sexual_content: maxSexual,
    violence: maxViolence,
    blood_gore: maxGore,
    weapons: maxWeapons,
    deepfake_risk: maxDeepfake,
    embedded_text_toxicity: maxEmbeddedTextToxicity,
    extracted_text: combinedExtractedText,
    toxicity: Math.max(maxNsfw, maxViolence, maxWeapons, maxEmbeddedTextToxicity),
  };

  const isSafe = overallRisk < 60 && maxEmbeddedTextToxicity < 60 && evidenceReferences.length === 0;
  const labels = allLabels.size > 0 ? Array.from(allLabels) : ['Safe content'];

  let reason = isSafe
    ? `Video verified safe across ${frameResults.length} analyzed frames and ${scenes.length} detected scenes.`
    : `Video flagged for safety violations (${labels[0] || 'Violations Detected'}) across ${evidenceReferences.length} evidence frame(s).`;

  if (maxDeepfake >= 60) {
    reason += ` High deepfake/synthetic risk detected (${maxDeepfake}%).`;
  }

  return {
    frames_analyzed: frameResults.length,
    scenes_detected: scenes.length,
    scene_changes: scenes,
    frame_results: frameResults,
    evidence_references: evidenceReferences,
    scores: aggregatedScores,
    labels,
    deepfake_risk: maxDeepfake,
    overall_risk: overallRisk,
    safe: isSafe,
    reason,
    model: modelName,
    model_version: modelVersion,
  };
}
