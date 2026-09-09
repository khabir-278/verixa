export interface User {
  id: string;
  uid?: string;
  username: string;
  name: string;
  displayName?: string;
  avatar: string;
  profilePicture?: string;
  cover?: string;
  bio: string;
  website?: string;
  location?: string;
  email?: string;
  verified: boolean;
  aiTrustBadge: string; // e.g. 'Verified Human 99.8%'
  safetyScore: number; // 0 to 100
  followersCount: number;
  followingCount: number;
  postsCount: number;
  likesCount?: number;
  isFollowing?: boolean;
  role?: string;
  joinedDate?: string;
  createdAt?: any;
}

export interface Comment {
  id: string;
  postId: string;
  user: User;
  content: string;
  timestamp: string;
  toxicityScore: number;
  categories: string[];
  aiStatus: 'safe' | 'blocked' | 'flagged';
  likes: number;
  isLiked?: boolean;
}

export interface AIScanDetails {
  nsfwScore: number;
  violenceScore: number;
  fakeConfidence: number;
  labels: string[];
  summary: string;
  safe: boolean;
}

export interface Post {
  id: string;
  user: User;
  caption: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  likes: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  comments: Comment[];
  shares: number;
  timestamp: string;
  tags: string[];
  category?: string;
  aiSafetyScore: number;
  aiScanDetails: AIScanDetails;
  location?: string;
  explainability?: RecommendationExplainability;
}

export interface Reel {
  id: string;
  user: User;
  caption: string;
  videoUrl: string;
  audioTitle: string;
  likes: number;
  isLiked?: boolean;
  commentsCount: number;
  sharesCount: number;
  aiTrustBadge: string;
  deepfakeRisk: number;
  moderationStatus?: string;
  tags: string[];
  createdAt?: string;
}

export interface Story {
  id: string;
  user: User;
  mediaUrl: string;
  media_url?: string;
  type: 'image' | 'video';
  mediaType?: 'image' | 'video';
  media_type?: 'image' | 'video';
  timestamp: string;
  viewed: boolean;
  isAIModerated: boolean;
  expiresAt?: string;
  expires_at?: string;
  viewsCount?: number;
  views_count?: number;
  viewedBy?: string[];
  viewed_by?: string[];
  likesCount?: number;
  likes_count?: number;
  likedBy?: string[];
  liked_by?: string[];
  isLiked?: boolean;
  moderationStatus?: string;
  moderation_status?: string;
  deepfakeRisk?: number;
  deepfake_risk?: number;
  createdAt?: string;
  created_at?: string;
}

export interface Notification {
  id: string;
  type: 'like' | 'follow' | 'comment' | 'mention' | 'friend_request' | 'ai_warning';
  user?: User;
  text: string;
  timestamp: string;
  read: boolean;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
  isAIVerified: boolean;
  mediaUrl?: string;
  isVoice?: boolean;
  voiceDuration?: string;
}

export interface ModerationAuditLog {
  id: string;
  timestamp: string;
  type: 'COMMENT_BLOCKED' | 'NSFW_FLAGGED' | 'SPAM_BOT_MUTED' | 'FAKE_PROFILE_SUSPENDED' | 'DEEPFAKE_QUARANTINED';
  contentSnippet: string;
  actor: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
}

export type PageView =
  | 'landing'
  | 'login'
  | 'signup'
  | 'verify-email'
  | 'home'
  | 'explore'
  | 'reels'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'ai-dashboard'
  | 'ai-architecture'
  | 'sentinel-ai'
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'help'
  | '404';

export interface UserSettings {
  darkMode: boolean;
  aiStrictness: 'LENIENT' | 'BALANCED' | 'STRICT' | 'ZERO_TOLERANCE';
  pushNotifications: boolean;
  emailAlerts: boolean;
  privacyLevel: 'PUBLIC' | 'FRIENDS_ONLY' | 'ENCRYPTED_PRIVATE';
  twoFactorAuth: boolean;
  language: string;
  autoFilterToxic?: boolean;
  warnDeepfakes?: boolean;
  blurSensitiveMedia?: boolean;
  hideOnlineStatus?: boolean;
  allowDMsFromNonFollowers?: boolean;
  highContrast?: boolean;
  reducedMotion?: boolean;
  commentAlerts?: boolean;
  weeklyDigest?: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  darkMode: true,
  aiStrictness: 'STRICT',
  pushNotifications: true,
  emailAlerts: true,
  privacyLevel: 'PUBLIC',
  twoFactorAuth: true,
  language: 'English (US)',
  autoFilterToxic: true,
  warnDeepfakes: true,
  blurSensitiveMedia: false,
  hideOnlineStatus: false,
  allowDMsFromNonFollowers: true,
  highContrast: false,
  reducedMotion: false,
  commentAlerts: true,
  weeklyDigest: true,
};

// ============================================================================
// MODERATION REVIEW & APPEAL SYSTEM CLIENT TYPES
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

// ============================================================================
// VERIXA PERSONALIZED FEED ENGINE TYPES
// ============================================================================

export type InteractionType =
  | 'view'
  | 'like'
  | 'unlike'
  | 'comment'
  | 'save'
  | 'unsave'
  | 'share'
  | 'click_hashtag'
  | 'dwell_time'
  | 'hide'
  | 'report';

export interface InteractionEventRecord {
  id: string;
  user_id: string;
  post_id: string;
  interaction_type: InteractionType;
  dwell_time_ms?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RecommendationFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface RecommendationExplainability {
  total_score: number;
  rank: number;
  strategy: string;
  factors: RecommendationFactor[];
  summary: string;
}

export interface RecommendationEventRecord {
  id: string;
  user_id: string;
  post_id: string;
  rank_position: number;
  total_score: number;
  scoring_factors: Record<string, any>;
  model_version: string;
  served_at: string;
}


