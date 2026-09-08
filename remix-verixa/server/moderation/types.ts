export type ContentType =
  | 'comment'
  | 'caption'
  | 'post_text'
  | 'image'
  | 'video'
  | 'gif'
  | 'story'
  | 'reel'
  | 'profile_picture'
  | 'cover_photo'
  | 'dm_text'
  | 'dm_media';


// Explicit Moderation State Machine required by VERIXA safety policy
export type ModerationState =
  | 'PENDING_SCAN'
  | 'SCANNING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVIEW_REQUIRED';

export type ModerationDecision = 'ALLOW' | 'WARNING' | 'QUARANTINE' | 'BLOCK';

export type ModerationStatus =
  | 'ALLOWED'
  | 'WARNING'
  | 'QUARANTINED'
  | 'BLOCKED'
  | 'REVIEW_REQUIRED';

export type ModerationCategory =
  | 'Hate speech'
  | 'Harassment'
  | 'Bullying'
  | 'Personal attacks'
  | 'Sexual harassment'
  | 'Threats'
  | 'Obscene language'
  | 'Spam'
  | 'Phishing/link abuse'
  | 'Safe content'
  | 'Adult Content'
  | 'Nudity'
  | 'Sexual Content'
  | 'Violence'
  | 'Blood & Gore'
  | 'Weapons'
  | 'Suspicious Synthetic / Deepfake'
  | 'Offensive Text in Image'
  | 'Toxic Text in Image'
  | string;

export interface MediaInspectionScores {
  toxicity?: number;
  risk?: number;
  nsfw?: number;
  nudity?: number;
  sexual_content?: number;
  violence?: number;
  blood_gore?: number;
  weapons?: number;
  deepfake_risk?: number;
  overall_risk?: number;
  embedded_text_toxicity?: number;
  extracted_text?: string;
  [key: string]: number | string | undefined;
}

export interface VideoEvidenceReference {
  timestamp: number;
  frame_index: number;
  scene_id?: number;
  violation_category: string;
  violation_score: number;
  thumbnail_ref?: string;
  description?: string;
}

export interface FrameModerationResult {
  timestamp: number;
  frame_index: number;
  scene_id: number;
  scores: MediaInspectionScores;
  labels: string[];
  safe: boolean;
  reason?: string;
  deepfake_indicators?: string[];
}

export interface SceneChangeInfo {
  scene_id: number;
  start_timestamp: number;
  end_timestamp: number;
  keyframe_timestamp: number;
  difference_score: number;
}

export interface VideoAnalysisOutput {
  frames_analyzed: number;
  scenes_detected: number;
  scene_changes: SceneChangeInfo[];
  frame_results: FrameModerationResult[];
  evidence_references: VideoEvidenceReference[];
  scores: MediaInspectionScores;
  labels: string[];
  deepfake_risk: number;
  overall_risk: number;
  safe: boolean;
  reason: string;
  model: string;
  model_version: string;
}

export interface GifAnalysisOutput {
  total_frames: number;
  frames_analyzed: number;
  frame_results: FrameModerationResult[];
  scores: MediaInspectionScores;
  labels: string[];
  overall_risk: number;
  safe: boolean;
  reason: string;
  model: string;
  model_version: string;
}

export interface NormalizedModerationResponse {
  decision: ModerationDecision;
  allowed: boolean;
  status: ModerationStatus;
  state: ModerationState;
  content_type: ContentType;
  language: string;
  language_detected: string;
  categories: string[];
  toxicity_score: number;
  confidence: number;
  risk_score: number;
  reason: string;
  safe_rewrite: string | null;
  model: string;
  model_version: string;
  analysis_id: string;
  timestamp?: string;

  // Media Safety Breakdown
  scores?: MediaInspectionScores;
  labels?: string[];
  deepfake_risk?: number;
  video_analysis?: VideoAnalysisOutput;
  gif_analysis?: GifAnalysisOutput;
  evidence_references?: VideoEvidenceReference[];

  // Backwards-compatible aliases for existing client components
  toxicityScore?: number;
  category?: string;
  message?: string;
  under_review?: boolean;
  safe?: boolean;
  suggestion?: string;
  detected_labels?: string[];
  classification?: string;
}

export interface ModerationRequestInput {
  content: string; // text, base64 data URL, or remote URL
  content_type?: string;
  mime_type?: string;
  context?: string;
  user_id?: string;
  username?: string;
  target_id?: string;
  content_id?: string;
  metadata?: Record<string, any>;
  frames?: Array<{ timestamp: number; data: string }>;
  interval_seconds?: number;
}

export interface AnalysisResult {
  language: string;
  language_detected?: string;
  categories: string[];
  toxicity_score: number;
  confidence: number;
  risk_score: number;
  reason: string;
  safe_rewrite: string | null;
  model: string;
  model_version: string;
  analysis_id: string;
  is_failure?: boolean;
  failure_reason?: string;

  // Optional Media Safety fields
  scores?: MediaInspectionScores;
  labels?: string[];
  deepfake_risk?: number;
  evidence_references?: VideoEvidenceReference[];
  video_analysis?: VideoAnalysisOutput;
  gif_analysis?: GifAnalysisOutput;
}

export interface ModerationEventRecord {
  analysis_id: string;
  content_id: string;
  content_type: ContentType;
  model: string;
  model_version: string;
  scores: MediaInspectionScores;
  labels: string[];
  decision: ModerationDecision;
  state: ModerationState;
  timestamps: {
    created_at: string;
    analyzed_at: string;
  };
  allowed: boolean;
  status: ModerationStatus;
  confidence: number;
  reason: string;
  content_hash: string;
  content_length: number;
  snippet_redacted: string;
  language: string;
  evidence_references?: VideoEvidenceReference[];
  user_id?: string;
  username?: string;
  target_id?: string;
  created_at: string;
}

// =============================================================
// VERIXA Behavioral Safety Intelligence Types
// =============================================================

// 1. Cyberbullying Detection Types
export type CyberbullyingPatternType =
  | 'repeated_attacks'
  | 'targeted_harassment'
  | 'escalating_hostility'
  | 'repeated_insults'
  | 'coordinated_harassment';

export interface BullyingEvidenceReference {
  interaction_id: string;
  timestamp: string;
  content_snippet: string;
  toxicity_score: number;
  context: string;
  actor_user_id: string;
  target_user_id: string;
}

export interface CyberbullyingEvent {
  id: string;
  target_user_id: string;
  target_username?: string;
  actor_user_id: string;
  actor_username?: string;
  pattern_type: CyberbullyingPatternType;
  risk_score: number; // 0 to 100
  confidence: number; // 0 to 100
  evidence_references: BullyingEvidenceReference[];
  timestamps: {
    detected_at: string;
    first_incident: string;
    latest_incident: string;
  };
}

export interface InteractionRecord {
  id: string;
  actor_user_id: string;
  actor_username?: string;
  target_user_id: string;
  target_username?: string;
  content: string;
  toxicity_score: number;
  timestamp: number;
  interaction_type: 'comment' | 'dm' | 'mention' | 'tag';
}

export interface BullyingAnalysisResult {
  has_bullying: boolean;
  risk_score: number;
  confidence: number;
  patterns_detected: CyberbullyingPatternType[];
  event?: CyberbullyingEvent;
  evidence_references: BullyingEvidenceReference[];
  recommended_action: 'none' | 'warning' | 'quarantine' | 'block_interaction' | 'reputation_penalty';
  reason: string;
}

// 2. Spam Detection Types
export type SpamType =
  | 'repeated_comments'
  | 'repeated_posts'
  | 'advertising_spam'
  | 'fake_giveaway'
  | 'referral_spam'
  | 'link_spam'
  | 'abnormal_frequency'
  | 'bot_like_behavior';

export interface SpamCheckResult {
  is_spam: boolean;
  spam_score: number; // 0 to 100
  spam_types: SpamType[];
  reason: string;
  confidence: number;
  action_taken: 'allow' | 'warn' | 'block' | 'rate_limit';
  velocity_metrics?: {
    posts_last_minute: number;
    comments_last_minute: number;
    avg_interval_seconds: number;
  };
}

// 3. Fake Account Risk Types
export type AccountRiskLevel = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';

export interface ObservedBehavioralFactors {
  account_age_days: number;
  posting_frequency_per_day: number;
  comment_frequency_per_day: number;
  follower_following_ratio: number;
  followers_count: number;
  following_count: number;
  reports_count: number;
  login_pattern_notes: string[];
  interaction_pattern_notes: string[];
  burst_activity_detected: boolean;
}

export interface FakeAccountRiskEvaluation {
  user_id: string;
  username?: string;
  risk_score: number; // 0 to 100
  confidence: number; // 0 to 100
  risk_level: AccountRiskLevel;
  probability_label: string; // Non-definitive terminology: e.g. "Low Risk of Inauthentic Activity (12%)"
  trust_classification: string; // e.g. "Likely Authentic Member" | "Requires Pattern Verification"
  observed_factors: ObservedBehavioralFactors;
  risk_indicators: string[];
  timestamp: string;
}

// 4. Privacy Scanner Types
export type PIIType =
  | 'phone_number'
  | 'email_address'
  | 'bank_account'
  | 'aadhaar_number'
  | 'credit_card';

export interface PIIDetection {
  type: PIIType;
  raw_match: string;
  masked_value: string;
  start_index: number;
  end_index: number;
  description: string;
}

export interface PrivacyScanResult {
  has_sensitive_data: boolean;
  detections: PIIDetection[];
  warning_message: string | null;
  redacted_text: string;
  detected_types: PIIType[];
}

// 5. Reputation System Types
export type ReputationEventType =
  | 'POST_VERIFIED_SAFE'
  | 'COMMENT_VERIFIED_SAFE'
  | 'SPAM_DETECTED'
  | 'CYBERBULLYING_PENALTY'
  | 'HARASSMENT_REPORT_UPHELD'
  | 'PII_LEAK_PREVENTED'
  | 'ACCOUNT_VERIFIED'
  | 'COMMUNITY_REPORT_FILED'
  | 'ADMIN_ADJUSTMENT';

export type ReputationSource =
  | 'ai_moderator'
  | 'spam_engine'
  | 'cyberbullying_detector'
  | 'privacy_scanner'
  | 'admin_review'
  | 'policy_engine';

export interface ReputationEventRecord {
  id: string;
  user_id: string;
  event: ReputationEventType;
  reason: string;
  source: ReputationSource;
  amount: number; // Signed delta: +5, -15, etc.
  previous_score: number;
  new_score: number; // Clamped to [0, 100]
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ReputationSummary {
  user_id: string;
  current_safety_score: number;
  trust_badge: string;
  total_events: number;
  recent_events: ReputationEventRecord[];
  positive_events_count: number;
  penalty_events_count: number;
}

// =============================================================
// 6. VERIXA AI Guardian Mode Types (Central Behavioral Risk Engine)
// =============================================================

export type GuardianRiskLevel =
  | 'SAFE'
  | 'WATCH_LIST'
  | 'HIGH_RISK'
  | 'RESTRICTED'
  | 'CRITICAL';

export type GuardianEventType =
  | 'TOXICITY_SPIKE'
  | 'TOXICITY'
  | 'HATE_SPEECH'
  | 'HARASSMENT'
  | 'CYBERBULLYING'
  | 'SPAM_DETECTED'
  | 'NSFW_UPLOAD_ATTEMPT'
  | 'DEEPFAKE_HIGH_RISK'
  | 'DEEPFAKE_SUSPICION'
  | 'DUPLICATE_MEDIA_ABUSE'
  | 'FAKE_ACCOUNT_SIGNAL'
  | 'PRIVACY_VIOLATION'
  | 'REPORT_RECEIVED'
  | 'SUCCESSFUL_APPEAL'
  | 'REPUTATION_CHANGE'
  | 'POSITIVE_COMMUNITY_ENGAGEMENT'
  | 'POSITIVE_COMMUNITY_PARTICIPATION'
  | 'RECOVERY_TIME_DECAY'
  | 'MANUAL_OVERRIDE';

export type GuardianActionType =
  | 'NORMAL_OPERATION'
  | 'WARNING'
  | 'ENHANCED_MODERATION'
  | 'STRICT_UPLOAD_CHECKS'
  | 'RATE_LIMIT_APPLIED'
  | 'TEMPORARY_RESTRICTION'
  | 'SUSPENSION'
  | 'RESTRICTION_LIFTED';

export type GuardianSeverity = 'low' | 'medium' | 'high' | 'critical' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GuardianExplainabilityFactor {
  label: string;
  impact: number;
  category: string;
  count?: number;
  latest_incident?: string;
}

export interface GuardianExplainability {
  safety_score: number;
  risk_level: GuardianRiskLevel;
  factors: GuardianExplainabilityFactor[];
  summary: string;
  recovery_tips: string[];
  detailed_signals?: Record<string, any>;
  is_admin_view?: boolean;
}

export interface GuardianScoreRecord {
  id: string;
  user_id: string;
  guardian_score: number;
  score?: number; // Ergonomic alias
  risk_level: GuardianRiskLevel;
  confidence: number;
  explainability: GuardianExplainability;
  signals_summary: Record<string, number>;
  allowed_actions?: string[];
  positive_factor_sum?: number;
  penalty_factor_sum?: number;
  last_calculated_at: string;
  last_updated?: string; // Ergonomic alias
  updated_at: string;
}

export interface GuardianEventRecord {
  id: string;
  user_id: string;
  event_type: GuardianEventType;
  severity: GuardianSeverity;
  impact: number;
  confidence: number;
  source: string;
  reason: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface GuardianActionRecord {
  id: string;
  user_id: string;
  action_type: GuardianActionType;
  risk_level: GuardianRiskLevel;
  enforcement_details: Record<string, any>;
  active: boolean;
  issued_at: string;
  expires_at?: string | null;
}

export interface UserRestrictionRecord {
  id: string;
  user_id: string;
  risk_level: GuardianRiskLevel;
  upload_restricted: boolean;
  comment_restricted: boolean;
  messaging_restricted: boolean;
  account_suspended: boolean;
  upload_cooldown_seconds: number;
  comment_cooldown_seconds: number;
  reason?: string;
  appeal_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  appeal_id?: string;
  created_at: string;
  updated_at: string;
}

export interface GuardianAppealRecord {
  id: string;
  user_id: string;
  restriction_id?: string;
  reason: string;
  appeal_text: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewer_id?: string;
  reviewer_notes?: string;
  resolved_at?: string;
  created_at: string;
}

// ============================================================================
// MODERATION REVIEW & APPEAL SYSTEM TYPES
// ============================================================================

export type AppealStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type AdminDecision = 'APPROVE' | 'REJECT';
export type ReviewItemType = 'appeal' | 'quarantine' | 'report' | 'high_risk_flag';
export type ReviewPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReviewQueueStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export type AdminActionType =
  | 'APPROVE_APPEAL'
  | 'REJECT_APPEAL'
  | 'RESOLVE_REPORT'
  | 'DISMISS_REPORT'
  | 'OVERTURN_MODERATION'
  | 'CONFIRM_BLOCK'
  | 'RESTRICT_USER'
  | 'LIFT_RESTRICTION'
  | 'MANUAL_SANCTION';

export interface AppealRecord {
  id: string;
  user_id: string;
  analysis_id: string;
  content_id: string;
  content_type: 'post' | 'comment' | 'story' | 'reel' | 'user_restriction' | 'profile_image' | 'cover_image';
  original_decision: 'BLOCK' | 'QUARANTINE' | 'REJECTED';
  reason: string;
  appeal_text: string;
  evidence_urls?: string[];
  status: AppealStatus;
  admin_decision?: AdminDecision | null;
  admin_id?: string | null;
  admin_notes?: string | null;
  created_at: string;
  resolved_at?: string | null;
  guardian_impact?: number;
  reputation_impact?: number;
}

export interface ReportRecord {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: 'post' | 'comment' | 'story' | 'reel' | 'user';
  reason: string;
  description?: string;
  severity: ReviewPriority;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  action_taken?: string | null;
  created_at: string;
}

export interface ReviewQueueItem {
  id: string;
  item_type: ReviewItemType;
  reference_id: string;
  analysis_id?: string | null;
  content_id: string;
  content_type: string;
  user_id: string;
  priority: ReviewPriority;
  risk_score: number;
  category: string;
  content_snippet?: string;
  status: ReviewQueueStatus;
  claimed_by?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface AdminActionRecord {
  id: string;
  admin_id: string;
  admin_username?: string;
  action_type: AdminActionType;
  target_type: 'appeal' | 'report' | 'post' | 'comment' | 'story' | 'reel' | 'user';
  target_id: string;
  analysis_id?: string | null;
  affected_user_id: string;
  reason: string;
  notes?: string | null;
  prior_state?: Record<string, any>;
  new_state?: Record<string, any>;
  guardian_adjustment: number;
  reputation_adjustment: number;
  ip_address?: string | null;
  created_at: string;
}

export interface AdminDashboardMetrics {
  pending_appeals_count: number;
  pending_reports_count: number;
  blocked_posts_count: number;
  blocked_comments_count: number;
  nsfw_events_count: number;
  spam_events_count: number;
  fake_account_alerts_count: number;
  cyberbullying_alerts_count: number;
  deepfake_alerts_count: number;
  guardian_risk_alerts_count: number;
  total_moderation_scans: number;
  daily_scan_metrics: Array<{
    day: string;
    scans: number;
    blocked: number;
  }>;
  threat_breakdown: Array<{
    name: string;
    value: number;
    color: string;
  }>;
}



