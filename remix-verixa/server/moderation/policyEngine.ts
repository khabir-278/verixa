import {
  ContentType,
  ModerationDecision,
  ModerationStatus,
  ModerationState,
  NormalizedModerationResponse,
  AnalysisResult,
} from './types';

/**
 * Maps decision to the explicit VERIXA Moderation State Machine:
 * PENDING_SCAN -> SCANNING -> APPROVED / REJECTED / REVIEW_REQUIRED
 */
export function mapDecisionToState(decision: ModerationDecision, isFailure?: boolean): ModerationState {
  if (isFailure || decision === 'QUARANTINE') {
    return 'REVIEW_REQUIRED';
  }
  if (decision === 'BLOCK') {
    return 'REJECTED';
  }
  return 'APPROVED';
}

/**
 * Evaluates raw AI analysis against platform policy rules and computes the final authoritative decision
 */
export function evaluatePolicy(
  analysis: AnalysisResult,
  contentType: ContentType
): NormalizedModerationResponse {
  // 1. FAIL-CLOSED: Check for AI failure / timeout -> MUST produce QUARANTINED / REVIEW_REQUIRED
  if (analysis.is_failure) {
    const lang = analysis.language_detected || analysis.language || 'Undetermined';
    const state: ModerationState = 'REVIEW_REQUIRED';
    return {
      decision: 'QUARANTINE',
      allowed: false,
      status: 'QUARANTINED',
      state,
      timestamp: new Date().toISOString(),
      content_type: contentType,
      language: lang,
      language_detected: lang,
      categories: analysis.categories,
      toxicity_score: analysis.toxicity_score,
      confidence: analysis.confidence,
      risk_score: analysis.risk_score,
      reason: analysis.reason || 'AI moderation service unverified or timed out. Placed in quarantine pending safety review.',
      safe_rewrite: null,
      model: analysis.model,
      model_version: analysis.model_version,
      analysis_id: analysis.analysis_id,

      scores: analysis.scores || {
        toxicity: analysis.toxicity_score,
        risk: analysis.risk_score,
        nsfw: 50,
        violence: 50,
        deepfake_risk: 50,
      },
      labels: analysis.labels || analysis.categories,
      deepfake_risk: analysis.deepfake_risk ?? 50,
      video_analysis: analysis.video_analysis,
      gif_analysis: analysis.gif_analysis,
      evidence_references: analysis.evidence_references,

      // Aliases
      toxicityScore: analysis.toxicity_score,
      category: analysis.categories[0] || 'Quarantine',
      message: 'Review Required: Content placed in quarantine pending safety verification.',
      under_review: true,
      safe: false,
      suggestion: 'Your content is held in quarantine pending safety verification.',
      detected_labels: analysis.categories,
      classification: 'QUARANTINE',
    };
  }

  const { toxicity_score, risk_score, confidence, categories } = analysis;
  const lang = analysis.language_detected || analysis.language || 'English';

  // Content-type specific risk thresholds
  const isProfileAsset = contentType === 'profile_picture' || contentType === 'cover_photo';
  const isVideoAsset = contentType === 'video' || contentType === 'reel';
  const blockThreshold = isProfileAsset ? 40 : 65;
  const warningThreshold = isProfileAsset ? 25 : 35;

  let decision: ModerationDecision = 'ALLOW';
  let status: ModerationStatus = 'ALLOWED';
  let allowed = true;

  // Check if categories contain text or visual violation labels
  const violationCategories = [
    'Hate speech',
    'Harassment',
    'Bullying',
    'Personal attacks',
    'Sexual harassment',
    'Sexual Abuse',
    'Threats',
    'Threat',
    'Severe Abuse',
    'Obscene language',
    'Spam',
    'Phishing/link abuse',
    'Adult Content',
    'Explicit Nudity',
    'Nudity',
    'Sexual Content',
    'Violence',
    'Graphic Violence',
    'Blood & Gore',
    'Weapons',
    'Firearms',
    'Bladed Weapons',
    'Suspicious Synthetic / Deepfake',
    'Offensive Text',
    'Offensive Text in Image',
    'Toxic Text in Image',
    'Abusive Text in Image',
  ];

  const hasViolation = categories.some((c) =>
    violationCategories.some((vc) => c.toLowerCase().includes(vc.toLowerCase()))
  );

  // Check media specific scores
  const mediaScores = analysis.scores || {};
  const highMediaRisk =
    (mediaScores.nsfw ?? 0) >= (isProfileAsset ? 35 : 60) ||
    (mediaScores.nudity ?? 0) >= (isProfileAsset ? 30 : 60) ||
    (mediaScores.sexual_content ?? 0) >= (isProfileAsset ? 30 : 60) ||
    (mediaScores.violence ?? 0) >= (isProfileAsset ? 40 : 65) ||
    (mediaScores.blood_gore ?? 0) >= (isProfileAsset ? 30 : 55) ||
    (mediaScores.weapons ?? 0) >= (isProfileAsset ? 35 : 70) ||
    (mediaScores.deepfake_risk ?? 0) >= (isProfileAsset ? 55 : 75) ||
    (mediaScores.embedded_text_toxicity ?? 0) >= (isProfileAsset ? 35 : 60);

  if (hasViolation || highMediaRisk || toxicity_score >= blockThreshold || risk_score >= blockThreshold) {
    decision = 'BLOCK';
    status = 'BLOCKED';
    allowed = false;
  } else if (confidence < 40) {
    // Low model confidence requires secondary human review -> QUARANTINE
    decision = 'QUARANTINE';
    status = 'REVIEW_REQUIRED';
    allowed = false;
  } else if (toxicity_score >= warningThreshold || risk_score >= warningThreshold) {
    // Borderline or mild profanity/slang -> WARNING
    decision = 'WARNING';
    status = 'WARNING';
    allowed = true; // Allowed with caution
  } else {
    // Fully safe
    decision = 'ALLOW';
    status = 'ALLOWED';
    allowed = true;
  }

  const state = mapDecisionToState(decision);

  // Construct message & suggestion
  let userMessage = 'Content verified safe.';
  if (decision === 'BLOCK') {
    const hasOffensiveText =
      categories.some((c) => c.toLowerCase().includes('text in image') || c.toLowerCase().includes('offensive text')) ||
      (mediaScores.embedded_text_toxicity ?? 0) >= (isProfileAsset ? 35 : 60);

    if (hasOffensiveText) {
      userMessage = `Your ${contentType.replace('_', ' ')} couldn't be published because offensive or toxic text was detected in the uploaded image.`;
    } else {
      userMessage = `Your ${contentType.replace('_', ' ')} couldn't be published because it violated safety rules (${categories[0] || 'Inappropriate Content'}).`;
    }
  } else if (decision === 'QUARANTINE') {
    userMessage = `Review Required: Your ${contentType.replace('_', ' ')} was queued for review by the safety moderation team.`;
  } else if (decision === 'WARNING') {
    userMessage = `Content warning: Media or phrasing may be sensitive or edgy.`;
  }

  return {
    decision,
    allowed,
    status,
    state,
    timestamp: new Date().toISOString(),
    content_type: contentType,
    language: lang,
    language_detected: lang,
    categories: analysis.categories,
    toxicity_score: analysis.toxicity_score,
    confidence: analysis.confidence,
    risk_score: analysis.risk_score,
    reason: analysis.reason,
    safe_rewrite: analysis.safe_rewrite,
    model: analysis.model,
    model_version: analysis.model_version,
    analysis_id: analysis.analysis_id,

    scores: analysis.scores || {
      toxicity: analysis.toxicity_score,
      risk: analysis.risk_score,
      nsfw: mediaScores.nsfw ?? 0,
      violence: mediaScores.violence ?? 0,
      weapons: mediaScores.weapons ?? 0,
      deepfake_risk: analysis.deepfake_risk ?? mediaScores.deepfake_risk ?? 0,
      overall_risk: analysis.risk_score,
    },
    labels: analysis.labels || analysis.categories,
    deepfake_risk: analysis.deepfake_risk ?? mediaScores.deepfake_risk ?? 0,
    video_analysis: analysis.video_analysis,
    gif_analysis: analysis.gif_analysis,
    evidence_references: analysis.evidence_references,

    // Backward-compatible fields
    toxicityScore: analysis.toxicity_score,
    category: analysis.categories[0] || (allowed ? 'Safe content' : 'Harassment'),
    message: userMessage,
    under_review: decision === 'QUARANTINE',
    safe: allowed,
    suggestion: analysis.safe_rewrite || (allowed ? 'Allow' : 'Please rewrite in a respectful manner.'),
    detected_labels: analysis.categories,
    classification: decision,
  };
}

export const policyEngine = {
  evaluate: evaluatePolicy,
  mapDecisionToState,
};

