import { extractGifFrames } from '../server/moderation/gifExtractor';
import {
  validateVideoMagicBytes,
  detectSceneChanges,
  aggregateVideoFrameRisks,
  InputVideoFrame,
} from '../server/moderation/videoSafetyEngine';
import { policyEngine, evaluatePolicy } from '../server/moderation/policyEngine';
import { storyService } from '../server/moderation/storyService';
import { reelService } from '../server/moderation/reelService';
import { moderationGateway } from '../server/moderation/moderationGateway';
import {
  FrameModerationResult,
  MediaInspectionScores,
  ModerationState,
  AnalysisResult,
} from '../server/moderation/types';

// Simple Test Runner
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

async function runMediaSafetyTests() {
  console.log('===========================================================');
  console.log('    VERIXA Media Safety Engine Automated Test Suite        ');
  console.log('===========================================================\n');

  // -------------------------------------------------------------
  // Section 1: GIF Binary Parsing & Frame Extraction
  // -------------------------------------------------------------
  console.log('--- 1. GIF Binary Parsing & Frame Extraction ---');

  // Create a minimal 1x1 valid GIF89a buffer
  const minimalGif89a = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, // Screen descriptor
    0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, // Color table (black & white)
    0x21, 0xF9, 0x04, 0x00, 0x0A, 0x00, 0x00, 0x00, // Graphic Control Extension (delay 10 = 100ms)
    0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // Image descriptor
    0x02, 0x02, 0x44, 0x01, 0x00, // Image data
    0x3B, // Trailer
  ]);

  const gifResult = extractGifFrames(minimalGif89a, 5);
  assert(gifResult.isGif, 'Validates GIF89a magic header');
  assert(gifResult.totalFrames === 1, `Extracted expected frame count (expected 1, got ${gifResult.totalFrames})`);
  assert(gifResult.width === 1 && gifResult.height === 1, 'Extracted correct GIF dimensions (1x1)');
  assert(gifResult.frames.length > 0, 'Generated representative frame data');

  // Corrupted / Invalid GIF check
  const invalidBuffer = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44]);
  const invalidGifResult = extractGifFrames(invalidBuffer);
  assert(!invalidGifResult.isGif, 'Detects and rejects invalid GIF non-magic buffer');
  assert(invalidGifResult.frames.length === 0, 'No frames returned for invalid GIF');

  console.log('');

  // -------------------------------------------------------------
  // Section 2: Video Processing, Container Validation & Scene Change Detection
  // -------------------------------------------------------------
  console.log('--- 2. Video Safety Engine & Scene Change Analysis ---');

  // 2.1 Video magic bytes validation
  // MP4 ftyp box: [0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p']
  const mp4Header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D]);
  const mp4Validation = validateVideoMagicBytes(mp4Header);
  assert(mp4Validation.valid && mp4Validation.format?.includes('mp4'), 'Identifies MP4 container via magic bytes');

  // WebM / MKV header: 0x1A, 0x45, 0xDF, 0xA3
  const webmHeader = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x00, 0x00, 0x00, 0x00]);
  const webmValidation = validateVideoMagicBytes(webmHeader);
  assert(webmValidation.valid && webmValidation.format === 'webm', 'Identifies WebM container via EBML magic bytes');

  // Arbitrary text / binary: not a video
  const nonVideoBuffer = Buffer.from('This is a plain text file without video magic bytes');
  const nonVideoValidation = validateVideoMagicBytes(nonVideoBuffer);
  assert(!nonVideoValidation.valid, 'Rejects non-video buffer');

  // 2.2 Scene Change Detection via color histogram distance
  // Mock base64 image frames
  const darkPixelFrame = Buffer.alloc(200, 10).toString('base64');
  const darkPixelFrame2 = Buffer.alloc(200, 12).toString('base64');
  const brightPixelFrame = Buffer.alloc(200, 240).toString('base64');

  const inputFrames: InputVideoFrame[] = [
    { timestamp: 0.0, data: `data:image/jpeg;base64,${darkPixelFrame}` },
    { timestamp: 1.0, data: `data:image/jpeg;base64,${darkPixelFrame2}` },
    { timestamp: 2.0, data: `data:image/jpeg;base64,${brightPixelFrame}` },
  ];

  const sceneAnalysis = detectSceneChanges(inputFrames, 0.25);
  assert(sceneAnalysis.scenes.length >= 1, 'Scene detection generated scene boundaries');
  assert(sceneAnalysis.keyframeIndices.includes(0), 'Initial keyframe index at 0 captured');

  // 2.3 Video Risk Aggregation & Evidence Reference Retention
  const mockFrameResults: FrameModerationResult[] = [
    {
      frame_index: 0,
      timestamp: 0.0,
      scene_id: 1,
      scores: {
        overall_risk: 5,
        risk: 5,
        nsfw: 2,
        violence: 1,
        weapons: 0,
        deepfake_risk: 5,
      },
      labels: ['nature', 'landscape'],
      safe: true,
      reason: 'Safe nature scenery',
    },
    {
      frame_index: 1,
      timestamp: 1.0,
      scene_id: 1,
      scores: {
        overall_risk: 88,
        risk: 88,
        nsfw: 88,
        violence: 12,
        weapons: 5,
        deepfake_risk: 20,
      },
      labels: ['explicit', 'nudity', 'NSFW / Adult Content'],
      safe: false,
      reason: 'Explicit nudity detected',
    },
    {
      frame_index: 2,
      timestamp: 2.0,
      scene_id: 2,
      scores: {
        overall_risk: 85,
        risk: 85,
        nsfw: 5,
        violence: 80,
        weapons: 85,
        deepfake_risk: 10,
      },
      labels: ['knife', 'weapons', 'blood'],
      safe: false,
      reason: 'Weapon violation detected',
    },
  ];

  const aggregated = aggregateVideoFrameRisks(mockFrameResults, sceneAnalysis.scenes, 'gemini-2.5-flash', 'v2.5');
  assert(aggregated.overall_risk >= 70, `Overall video risk captured peak violation (${aggregated.overall_risk}%)`);
  assert(aggregated.safe === false, 'Video marked unsafe due to violating frames');
  assert(aggregated.evidence_references.length === 2, `Retained only evidence references rather than raw video (${aggregated.evidence_references.length})`);
  assert(aggregated.evidence_references[0].timestamp === 1.0, 'Evidence correctly logs timestamp of first violation');
  assert(aggregated.evidence_references[1].violation_category.includes('weapon') || aggregated.evidence_references[1].violation_category.includes('knife'), 'Evidence correctly logs second violation category');

  console.log('');

  // -------------------------------------------------------------
  // Section 3: Policy Engine - Media Decision & State Machine
  // -------------------------------------------------------------
  console.log('--- 3. Server-Side Authoritative Policy Engine ---');

  // 3.1 Clean, safe post image
  const safeAnalysis: AnalysisResult = {
    language: 'English',
    reason: 'Verified safe',
    safe_rewrite: null,
    toxicity_score: 5,
    risk_score: 5,
    confidence: 96,
    categories: ['Safe content'],
    scores: {
      nsfw: 1,
      violence: 2,
      weapons: 0,
      deepfake_risk: 3,
      overall_risk: 5,
    },
    labels: ['mountain', 'sky', 'sunset'],
    model: 'gemini-2.5-flash',
    model_version: 'v2.5',
    analysis_id: `test_safe_${Date.now()}`,
  };
  const safeDecision = policyEngine.evaluate(safeAnalysis, 'image');
  assert(safeDecision.allowed === true, 'Safe image allowed');
  assert(safeDecision.decision === 'ALLOW', 'Safe image gets ALLOW decision');
  assert(safeDecision.state === 'APPROVED', 'Safe image state is APPROVED');

  // 3.2 Post image violating violence / weapons threshold
  const weaponAnalysis: AnalysisResult = {
    language: 'English',
    reason: 'Weapons detected',
    safe_rewrite: null,
    toxicity_score: 85,
    risk_score: 90,
    confidence: 94,
    categories: ['Weapons', 'Violence'],
    scores: {
      nsfw: 2,
      violence: 88,
      weapons: 92,
      deepfake_risk: 15,
      overall_risk: 90,
    },
    labels: ['firearm', 'assault rifle', 'combat'],
    model: 'gemini-2.5-flash',
    model_version: 'v2.5',
    analysis_id: `test_weapon_${Date.now()}`,
  };
  const weaponDecision = policyEngine.evaluate(weaponAnalysis, 'image');
  assert(weaponDecision.allowed === false, 'Violating weapon image blocked');
  assert(weaponDecision.decision === 'BLOCK', 'Weapon image gets BLOCK decision');
  assert(weaponDecision.state === 'REJECTED', 'Weapon image state is REJECTED');

  // 3.3 Strict Profile Picture Zero-Tolerance Rules (nsfw >= 35 for profile asset triggers block)
  const mildAvatarAnalysis: AnalysisResult = {
    language: 'English',
    reason: 'Suggestive content in profile',
    safe_rewrite: null,
    toxicity_score: 36,
    risk_score: 38,
    confidence: 92,
    categories: ['Adult Content'],
    scores: {
      nsfw: 40, // >= 35 profile threshold
      violence: 1,
      weapons: 0,
      deepfake_risk: 4,
      overall_risk: 40,
    },
    labels: ['swimwear', 'suggestive'],
    model: 'gemini-2.5-flash',
    model_version: 'v2.5',
    analysis_id: `test_avatar_${Date.now()}`,
  };
  const avatarDecision = policyEngine.evaluate(mildAvatarAnalysis, 'profile_picture');
  assert(avatarDecision.allowed === false, 'Profile picture strictly blocks sensitive content');
  assert(avatarDecision.state === 'REJECTED', 'Profile picture state is REJECTED');

  // 3.4 Strict Cover Photo Rules (weapons >= 35 for profile asset triggers block)
  const weaponCoverAnalysis: AnalysisResult = {
    language: 'English',
    reason: 'Weapon in cover photo',
    safe_rewrite: null,
    toxicity_score: 38,
    risk_score: 42,
    confidence: 91,
    categories: ['Weapons'],
    scores: {
      nsfw: 1,
      violence: 42,
      weapons: 45, // >= 35 profile threshold
      deepfake_risk: 5,
      overall_risk: 45,
    },
    labels: ['hunting rifle'],
    model: 'gemini-2.5-flash',
    model_version: 'v2.5',
    analysis_id: `test_cover_${Date.now()}`,
  };
  const coverDecision = policyEngine.evaluate(weaponCoverAnalysis, 'cover_photo');
  assert(coverDecision.allowed === false, 'Cover photo strictly blocks weapons');
  assert(coverDecision.state === 'REJECTED', 'Cover photo state is REJECTED');

  // 3.5 Fail-Closed Quarantine Mandate on System / Model Error
  const failureAnalysis: AnalysisResult = {
    language: 'English',
    reason: 'System error during analysis',
    safe_rewrite: null,
    toxicity_score: 0,
    risk_score: 0,
    confidence: 0,
    categories: ['System Error'],
    scores: {
      nsfw: 0,
      violence: 0,
      weapons: 0,
      deepfake_risk: 0,
    },
    labels: ['Scan Failed'],
    is_failure: true,
    model: 'gemini-2.5-flash',
    model_version: 'v2.5',
    analysis_id: `test_fail_${Date.now()}`,
  };
  const failClosedDecision = policyEngine.evaluate(failureAnalysis, 'image');
  assert(failClosedDecision.allowed === false, 'Fail-Closed: AI error prevents automatic approval');
  assert(failClosedDecision.decision === 'QUARANTINE', 'Fail-Closed: Decision set to QUARANTINE');
  assert(failClosedDecision.state === 'REVIEW_REQUIRED', 'Fail-Closed: State set to REVIEW_REQUIRED');

  console.log('');

  // -------------------------------------------------------------
  // Section 4: Stories Service - Pre-Publication, 24h Expiry & View Tracking
  // -------------------------------------------------------------
  console.log('--- 4. Stories Service: Pre-Publication, 24h Expiry & Views ---');

  // 4.1 Pre-publication moderation: create safe image story
  const storyCreation = await storyService.createStory({
    userId: 'user_story_test',
    username: 'alice_story',
    name: 'Alice',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mediaType: 'image',
  });

  if (storyCreation.allowed && storyCreation.story) {
    assert(storyCreation.allowed === true, 'Safe story permitted for publication');
    assert(Boolean(storyCreation.story), 'Story created with persisted ID');
    assert(
      storyCreation.story?.moderation_status === 'ALLOWED' || storyCreation.story?.moderation_state === 'APPROVED',
      'Story marked ALLOWED/APPROVED'
    );

    // 4.2 24-hour expiry lifecycle calculation
    const story = storyCreation.story;
    const createdTime = new Date(story.created_at).getTime();
    const expiresTime = new Date(story.expires_at).getTime();
    const diffHours = (expiresTime - createdTime) / (1000 * 60 * 60);
    assert(Math.round(diffHours) === 24, `Story expiresAt accurately set to 24 hours (calculated: ${diffHours.toFixed(1)}h)`);

    // 4.3 Expired stories filter
    const activeStories = storyService.getActiveStories('user_story_test');
    assert(activeStories.some((s) => s.id === story.id), 'Fresh story visible in active stories list');

    // 4.4 Idempotent view tracking
    const view1 = storyService.recordView(story.id, 'viewer_bob');
    assert(view1.success === true && view1.viewsCount === 1, 'First view increments story viewsCount to 1');

    const view2 = storyService.recordView(story.id, 'viewer_bob'); // Repeat view by same user
    assert(view2.viewsCount === 1, 'Idempotent: Duplicate view by same user does not increment viewsCount again');

    const view3 = storyService.recordView(story.id, 'viewer_charlie'); // Different user
    assert(view3.viewsCount === 2, 'New user view increments viewsCount to 2');

    // 4.5 Story like toggling
    const like1 = storyService.toggleLike(story.id, 'viewer_bob');
    assert(like1.success === true && like1.isLiked === true && like1.likesCount === 1, 'Liking story increments likesCount to 1');

    const like2 = storyService.toggleLike(story.id, 'viewer_bob');
    assert(like2.success === true && like2.isLiked === false && like2.likesCount === 0, 'Unliking story decrements likesCount to 0');

    const like3 = storyService.toggleLike(story.id, 'viewer_bob');
    const like4 = storyService.toggleLike(story.id, 'viewer_charlie');
    assert(like4.likesCount === 2, 'Multiple users liking story increments likesCount to 2');

    // 4.6 Clean up test story so it never bleeds into live feed
    storyService.deleteStory(story.id);
  } else {
    assert(storyCreation.moderation?.state === 'REVIEW_REQUIRED', 'Fail-Closed: Unconfigured AI story becomes REVIEW_REQUIRED');
    assert(storyCreation.allowed === false, 'Fail-Closed: Unverified story publication blocked');
  }

  console.log('');

  // -------------------------------------------------------------
  // Section 5: Reels Service - Persistence, Video Moderation & Deepfake Risk
  // -------------------------------------------------------------
  console.log('--- 5. Reels Service: Video Moderation, Deepfake Risk & Persistence ---');

  // 5.1 Create Reel with simulated video frames
  const sampleFramePayload = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ];

  const reelCreation = await reelService.createReel({
    userId: 'user_reel_test',
    username: 'bob_creator',
    name: 'Bob',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    caption: 'My first AI-verified reel! #safety #verixa',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
    audioTitle: 'Original Forest Sound',
    tags: ['safety', 'verixa'],
    frames: [{ timestamp: 0, data: sampleFramePayload[0] }],
  });

  if (reelCreation.allowed && reelCreation.reel) {
    assert(reelCreation.allowed === true, 'Authentic reel permitted for publication');
    assert(Boolean(reelCreation.reel), 'Reel created with persisted record');
    assert(typeof reelCreation.reel?.deepfake_risk === 'number', `Reel records genuine deepfake risk score: ${reelCreation.reel?.deepfake_risk}%`);
    assert(
      reelCreation.reel?.moderation_status === 'ALLOWED' || reelCreation.reel?.moderation_state === 'APPROVED',
      'Reel records moderation status: ALLOWED/APPROVED'
    );

    // 5.2 Reel persistence check
    const allReels = reelService.getReels();
    assert(allReels.some((r) => r.id === reelCreation.reel?.id), 'Reel persists in server reels collection');

    // 5.3 Toggle like on reel
    const likedResult = reelService.toggleLike(reelCreation.reel!.id);
    assert(likedResult.likes === 1 && likedResult.isLiked === true, 'Reel like toggled on');
  } else {
    assert(reelCreation.moderation?.state === 'REVIEW_REQUIRED', 'Fail-Closed: Unconfigured AI reel becomes REVIEW_REQUIRED');
    assert(reelCreation.allowed === false, 'Fail-Closed: Unverified reel publication blocked');
  }

  console.log('');

  // -------------------------------------------------------------
  // Section 6: Gateway End-to-End & Audit Logging Fields
  // -------------------------------------------------------------
  console.log('--- 6. Centralized Gateway & Complete Audit Trail Fields ---');

  const testContentId = `cnt_${Date.now()}`;
  const gatewayResult = await moderationGateway.moderate({
    content: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
    content_type: 'image',
    context: 'gateway media test',
    user_id: 'test_user_audit',
    target_id: testContentId,
  });

  // Verify all required audit trail specifications
  assert(Boolean(gatewayResult.analysis_id), `Audit logs analysis_id (${gatewayResult.analysis_id})`);
  assert(Boolean(gatewayResult.decision), `Audit logs decision (${gatewayResult.decision})`);
  assert(Boolean(gatewayResult.state), `Audit logs explicit state machine state (${gatewayResult.state})`);
  assert(gatewayResult.scores !== undefined, 'Audit logs comprehensive scores object');
  assert(Array.isArray(gatewayResult.labels), 'Audit logs labels array');
  assert(Array.isArray(gatewayResult.categories), 'Audit logs categories array');
  assert(Boolean(gatewayResult.timestamp), 'Audit logs ISO 8601 timestamp');
  assert(Boolean(gatewayResult.model_version), `Audit logs model and version (${gatewayResult.model_version})`);

  console.log('\n===========================================================');
  console.log(`  Tests Completed: ${totalTests}`);
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${failedTests}`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMediaSafetyTests().catch((err) => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
