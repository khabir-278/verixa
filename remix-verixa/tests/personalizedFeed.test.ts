/**
 * VERIXA Personalized Feed Engine - Automated Test Suite
 *
 * Comprehensive validation of:
 * 1. Hard Content Safety Filter (zero-tolerance for blocked/quarantined/unsafe content)
 * 2. Ethical Non-Discrimination Guardrail (viewer Guardian score has 0 impact on feed ranking)
 * 3. 11-Vector Transparent Weighted Scoring System
 * 4. Human-Readable Explainability Breakdown Generation
 * 5. Pluggable Architecture (Strategy Pattern for future ML recommendation models)
 * 6. Interaction Event Tracking & Telemetry Persistence
 * 7. Dynamic Adjustable Scoring Weights
 */

import { TransparentHeuristicRanker, MLRecommendationRanker } from '../server/feed/rankingStrategy';
import { FeedService } from '../server/feed/feedService';
import {
  PostCandidate,
  ViewerContext,
  DEFAULT_FEED_WEIGHTS,
  FeedScoringWeights,
} from '../server/feed/types';

// Test runner infrastructure
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runPersonalizedFeedEngineTests() {
  console.log('================================================================');
  console.log('       VERIXA Personalized Feed Engine Test Suite               ');
  console.log('================================================================\n');

  const ranker = new TransparentHeuristicRanker();

  // Helper to construct test candidates
  const createMockCandidate = (overrides: Partial<PostCandidate>): PostCandidate => ({
    id: `post_${Math.random().toString(36).substring(2, 8)}`,
    user_id: 'creator_1',
    caption: 'Verified safe technology post #ai #verixa',
    media_url: 'https://example.com/clean.jpg',
    media_type: 'image',
    category: 'Technology',
    hashtags: ['ai', 'verixa'],
    likes_count: 10,
    comments_count: 5,
    saves_count: 3,
    shares_count: 2,
    visibility: 'public',
    moderation_status: 'approved',
    ai_safety_score: 95,
    ai_scan_details: { safe: true, nsfwScore: 0, violenceScore: 0 },
    created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    author_safety_score: 100,
    ...overrides,
  });

  // Helper to construct test viewer context
  const createMockContext = (overrides?: Partial<ViewerContext>): ViewerContext => ({
    viewer_id: 'user_tester',
    followed_user_ids: new Set(['creator_followed']),
    liked_post_ids: new Set(),
    saved_post_ids: new Set(),
    interacted_author_counts: new Map(),
    interacted_hashtag_counts: new Map(),
    preferred_categories: ['Technology', 'AI'],
    preferred_hashtags: ['ai', 'verixa'],
    viewer_guardian_score: 100,
    ...overrides,
  });

  // ============================================================================
  // TEST GROUP 1: ZERO-TOLERANCE CONTENT SAFETY FILTER
  // ============================================================================
  console.log('--- 1. Hard Content Safety Filter Guardrails ---');

  const approvedCandidate = createMockCandidate({ id: 'p_approved', moderation_status: 'approved', ai_safety_score: 95 });
  const blockedCandidate = createMockCandidate({ id: 'p_blocked', moderation_status: 'blocked', ai_safety_score: 95 });
  const quarantinedCandidate = createMockCandidate({ id: 'p_quarantined', moderation_status: 'quarantined', ai_safety_score: 95 });
  const rejectedCandidate = createMockCandidate({ id: 'p_rejected', moderation_status: 'rejected', ai_safety_score: 95 });
  const flaggedCandidate = createMockCandidate({ id: 'p_flagged', moderation_status: 'flagged', ai_safety_score: 95 });
  const unsafeScoreCandidate = createMockCandidate({ id: 'p_low_safety', moderation_status: 'approved', ai_safety_score: 42 }); // < 60 threshold

  const safetyCandidates = [
    approvedCandidate,
    blockedCandidate,
    quarantinedCandidate,
    rejectedCandidate,
    flaggedCandidate,
    unsafeScoreCandidate,
  ];

  const safetyRanked = await ranker.rank(safetyCandidates, createMockContext());

  assert(safetyRanked.length === 1, 'Strictly only 1 approved post passed safety filter', `Found: ${safetyRanked.length}`);
  assert(safetyRanked[0].post.id === 'p_approved', 'Only verified approved candidate was ranked');
  assert(
    !safetyRanked.some((r) => r.post.id === 'p_blocked'),
    'Blocked post is strictly omitted from recommendation pool'
  );
  assert(
    !safetyRanked.some((r) => r.post.id === 'p_quarantined'),
    'Quarantined post is strictly omitted from recommendation pool'
  );
  assert(
    !safetyRanked.some((r) => r.post.id === 'p_rejected'),
    'Rejected post is strictly omitted from recommendation pool'
  );
  assert(
    !safetyRanked.some((r) => r.post.id === 'p_low_safety'),
    'Post with ai_safety_score < 60 is strictly pruned before ranking'
  );

  // ============================================================================
  // TEST GROUP 2: ETHICAL NON-DISCRIMINATION GUARDRAIL
  // ============================================================================
  console.log('\n--- 2. Ethical Non-Discrimination Guardrail ---');

  const neutralPost = createMockCandidate({ id: 'p_neutral', user_id: 'creator_neutral' });
  
  const highGuardianViewer = createMockContext({ viewer_guardian_score: 100 });
  const lowGuardianViewer = createMockContext({ viewer_guardian_score: 15 }); // CRITICAL risk score user

  const highGuardianRanked = await ranker.rank([neutralPost], highGuardianViewer);
  const lowGuardianRanked = await ranker.rank([neutralPost], lowGuardianViewer);

  assert(highGuardianRanked.length === 1 && lowGuardianRanked.length === 1, 'Both users receive candidate post');
  assert(
    highGuardianRanked[0].explainability.total_score === lowGuardianRanked[0].explainability.total_score,
    'Viewer Guardian score has ZERO influence on feed ranking scores',
    `High: ${highGuardianRanked[0].explainability.total_score}, Low: ${lowGuardianRanked[0].explainability.total_score}`
  );
  assert(
    !highGuardianRanked[0].explainability.factors.some((f) => f.name.toLowerCase().includes('guardian')),
    'Explainability factors do NOT include viewer Guardian score penalties'
  );

  // ============================================================================
  // TEST GROUP 3: 11-VECTOR TRANSPARENT SCORING SYSTEM
  // ============================================================================
  console.log('\n--- 3. 11-Vector Transparent Weighted Scoring System ---');

  // Vector 1: Followed Authors (S_follow)
  const followedPost = createMockCandidate({ id: 'p_followed', user_id: 'creator_followed' });
  const unfollowedPost = createMockCandidate({ id: 'p_unfollowed', user_id: 'creator_unfollowed' });
  const followTestResult = await ranker.rank([followedPost, unfollowedPost], createMockContext());

  assert(followTestResult[0].post.id === 'p_followed', 'Followed creator post ranks #1');
  const followedFactor = followTestResult[0].explainability.factors.find((f) => f.name.includes('Followed'));
  assert(!!followedFactor && followedFactor.score === DEFAULT_FEED_WEIGHTS.followWeight, 'Followed creator receives exact followWeight (+35 pts)');

  // Vector 2: Likes (S_likes)
  const highLikesPost = createMockCandidate({ id: 'p_high_likes', likes_count: 500 });
  const lowLikesPost = createMockCandidate({ id: 'p_low_likes', likes_count: 0 });
  const likesTestResult = await ranker.rank([highLikesPost, lowLikesPost], createMockContext());
  assert(likesTestResult[0].post.id === 'p_high_likes', 'Post with high likes ranks above 0-likes post');

  // Vector 3: Comments (S_comments)
  const highCommentsPost = createMockCandidate({ id: 'p_high_comments', comments_count: 100 });
  const lowCommentsPost = createMockCandidate({ id: 'p_low_comments', comments_count: 0 });
  const commentsTestResult = await ranker.rank([highCommentsPost, lowCommentsPost], createMockContext());
  assert(commentsTestResult[0].post.id === 'p_high_comments', 'High comments conversational resonance scores higher');

  // Vector 4: Saves (S_saves)
  const highSavesPost = createMockCandidate({ id: 'p_high_saves', saves_count: 80 });
  const lowSavesPost = createMockCandidate({ id: 'p_low_saves', saves_count: 0 });
  const savesTestResult = await ranker.rank([highSavesPost, lowSavesPost], createMockContext());
  assert(savesTestResult[0].post.id === 'p_high_saves', 'Bookmarked saves yield strong high-intent boost');

  // Vector 5: Shares (S_shares)
  const highSharesPost = createMockCandidate({ id: 'p_high_shares', shares_count: 60 });
  const lowSharesPost = createMockCandidate({ id: 'p_low_shares', shares_count: 0 });
  const sharesTestResult = await ranker.rank([highSharesPost, lowSharesPost], createMockContext());
  assert(sharesTestResult[0].post.id === 'p_high_shares', 'Viral shares content receives distribution boost');

  // Vector 6: Category (S_category)
  const matchCategoryPost = createMockCandidate({ id: 'p_cat_match', category: 'Technology' });
  const unmatchCategoryPost = createMockCandidate({ id: 'p_cat_unmatch', category: 'Gardening' });
  const catTestResult = await ranker.rank([matchCategoryPost, unmatchCategoryPost], createMockContext());
  assert(catTestResult[0].post.id === 'p_cat_match', 'Matching preferred category scores higher than unrelated category');

  // Vector 7: Hashtags (S_hashtags)
  const matchHashtagsPost = createMockCandidate({ id: 'p_tag_match', hashtags: ['ai', 'verixa'] });
  const unmatchHashtagsPost = createMockCandidate({ id: 'p_tag_unmatch', hashtags: ['cooking', 'baking'] });
  const tagTestResult = await ranker.rank([matchHashtagsPost, unmatchHashtagsPost], createMockContext());
  assert(tagTestResult[0].post.id === 'p_tag_match', 'Matching preferred hashtags score higher than unaligned hashtags');

  // Vector 8: Interaction History (S_history)
  const historyContext = createMockContext({
    interacted_author_counts: new Map([['frequent_author', 10]]),
  });
  const frequentAuthorPost = createMockCandidate({ id: 'p_freq', user_id: 'frequent_author' });
  const newAuthorPost = createMockCandidate({ id: 'p_new', user_id: 'stranger_author' });
  const historyTestResult = await ranker.rank([frequentAuthorPost, newAuthorPost], historyContext);
  assert(historyTestResult[0].post.id === 'p_freq', 'Interacted author in viewer history scores higher');

  // Vector 9: Recency (S_recency)
  const freshPost = createMockCandidate({ id: 'p_fresh', created_at: new Date(Date.now() - 300000).toISOString() }); // 5 min ago
  const stalePost = createMockCandidate({ id: 'p_stale', created_at: new Date(Date.now() - 604800000).toISOString() }); // 7 days ago
  const recencyTestResult = await ranker.rank([freshPost, stalePost], createMockContext());
  assert(recencyTestResult[0].post.id === 'p_fresh', 'Recent fresh post receives higher recency score than stale post');

  // Vector 10: Content Safety Boost (S_safety)
  const pristineSafetyPost = createMockCandidate({ id: 'p_pristine', ai_safety_score: 99 });
  const marginalSafetyPost = createMockCandidate({ id: 'p_marginal', ai_safety_score: 65 });
  const safetyBoostResult = await ranker.rank([pristineSafetyPost, marginalSafetyPost], createMockContext());
  assert(safetyBoostResult[0].post.id === 'p_pristine', 'Higher AI safety score produces greater positive safety boost');

  // Vector 11: User Preferences (S_preferences)
  const contextWithPref = createMockContext({ preferred_categories: ['Design'] });
  const prefMatch = createMockCandidate({ id: 'p_pref', category: 'Design' });
  const prefMiss = createMockCandidate({ id: 'p_miss', category: 'Automotive' });
  const prefResult = await ranker.rank([prefMatch, prefMiss], contextWithPref);
  assert(prefResult[0].post.id === 'p_pref', 'User preferences alignment accurately prioritizes matched candidate');

  // ============================================================================
  // TEST GROUP 4: EXPLAINABILITY BREAKDOWN & AUDITABILITY
  // ============================================================================
  console.log('\n--- 4. Explainability Factor Breakdown & Auditability ---');

  const explainPost = createMockCandidate({
    id: 'p_explain',
    user_id: 'creator_followed',
    likes_count: 50,
    category: 'Technology',
    hashtags: ['ai'],
  });

  const explainResult = await ranker.rank([explainPost], createMockContext());
  const item = explainResult[0];

  assert(item.explainability.rank === 1, 'Assigned rank position is 1');
  assert(item.explainability.strategy === 'v1-transparent-heuristic', 'Strategy identified as v1-transparent-heuristic');
  assert(typeof item.explainability.total_score === 'number' && item.explainability.total_score > 0, 'Total score is a positive number');
  assert(Array.isArray(item.explainability.factors) && item.explainability.factors.length > 0, 'Factors list is populated');
  assert(typeof item.explainability.summary === 'string' && item.explainability.summary.length > 10, 'Human-readable summary is generated');

  // Check factor breakdown fields
  const firstFactor = item.explainability.factors[0];
  assert(typeof firstFactor.name === 'string', 'Factor has human-readable name');
  assert(typeof firstFactor.score === 'number', 'Factor has numeric score');
  assert(typeof firstFactor.weight === 'number', 'Factor has weight ratio');
  assert(typeof firstFactor.description === 'string', 'Factor has descriptive rationale');

  // Check sum consistency
  const factorSum = item.explainability.factors.reduce((acc, f) => acc + f.score, 0);
  const roundedSum = Math.round(factorSum * 10) / 10;
  assert(
    Math.abs(roundedSum - item.explainability.total_score) < 0.2,
    'Sum of individual transparent factors matches total_score',
    `Sum: ${roundedSum}, Total: ${item.explainability.total_score}`
  );

  // ============================================================================
  // TEST GROUP 5: PLUGGABLE ARCHITECTURE (STRATEGY PATTERN)
  // ============================================================================
  console.log('\n--- 5. Pluggable Architecture (Strategy Pattern) ---');

  const feedService = new FeedService();
  assert(feedService.getRankingStrategy().id === 'v1-transparent-heuristic', 'Default strategy is TransparentHeuristicRanker');

  const mlRanker = new MLRecommendationRanker();
  feedService.setRankingStrategy(mlRanker);
  assert(feedService.getRankingStrategy().id === 'v2-trained-ml-ranker', 'Successfully swapped ranking strategy to MLRecommendationRanker');

  // Test ML ranker ranking execution
  const testCandidate = createMockCandidate({ id: 'p_ml_test' });
  const mlRanked = await mlRanker.rank([testCandidate], createMockContext());
  assert(mlRanked.length === 1, 'ML ranker produces ranked result');
  assert(mlRanked[0].explainability.strategy === 'v2-trained-ml-ranker', 'Explainability reflects active ML strategy');
  assert(mlRanked[0].explainability.summary.includes('[ML Mode]'), 'Explainability summary reflects ML strategy prefix');

  // Swap back to heuristic ranker
  feedService.setRankingStrategy(ranker);
  assert(feedService.getRankingStrategy().id === 'v1-transparent-heuristic', 'Successfully restored TransparentHeuristicRanker');

  // ============================================================================
  // TEST GROUP 6: INTERACTION TELEMETRY & PERSISTENCE
  // ============================================================================
  console.log('\n--- 6. Interaction Telemetry & Event Logging ---');

  const testUserId = `user_telemetry_${Date.now()}`;
  const testPostId = `post_telemetry_${Date.now()}`;

  // Log like interaction
  const likeEvt = await feedService.logInteraction({
    userId: testUserId,
    postId: testPostId,
    interactionType: 'like',
    metadata: { category: 'Technology', hashtags: ['ai', 'defense'] },
  });

  assert(likeEvt.id.startsWith('inte_'), 'Interaction event record has unique ID');
  assert(likeEvt.interaction_type === 'like', 'Event recorded interaction_type as like');
  assert(likeEvt.user_id === testUserId, 'Event recorded correct user_id');

  // Log dwell time interaction
  const dwellEvt = await feedService.logInteraction({
    userId: testUserId,
    postId: testPostId,
    interactionType: 'dwell_time',
    dwellTimeMs: 14500,
  });
  assert(dwellEvt.dwell_time_ms === 14500, 'Recorded dwell_time_ms as 14,500ms');

  // Verify retrieval
  const userInteractions = feedService.getInteractions(testUserId);
  assert(userInteractions.length >= 2, 'Interactions correctly queryable by userId');

  // ============================================================================
  // TEST GROUP 7: ADJUSTABLE SCORING WEIGHTS
  // ============================================================================
  console.log('\n--- 7. Dynamic Adjustable Scoring Weights ---');

  const initialWeights = feedService.getScoringWeights();
  assert(initialWeights.followWeight === 35, 'Initial followWeight is 35');

  // Update weights
  const updatedWeights = feedService.updateScoringWeights({
    followWeight: 50,
    recencyWeight: 30,
  });

  assert(updatedWeights.followWeight === 50, 'followWeight updated to 50');
  assert(updatedWeights.recencyWeight === 30, 'recencyWeight updated to 30');
  assert(feedService.getScoringWeights().followWeight === 50, 'FeedService holds updated weights');

  // Restore default weights
  feedService.updateScoringWeights(DEFAULT_FEED_WEIGHTS);
  assert(feedService.getScoringWeights().followWeight === 35, 'Weights successfully restored to default');

  // ============================================================================
  // TEST SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPersonalizedFeedEngineTests().catch((err) => {
  console.error('Fatal error in personalized feed test runner:', err);
  process.exit(1);
});
