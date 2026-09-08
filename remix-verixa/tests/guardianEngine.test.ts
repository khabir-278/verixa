/**
 * VERIXA AI Guardian Mode - Automated Test Suite
 *
 * Comprehensive validation of the central behavioral risk engine:
 * 1. Score Calculation & Risk Tiers (SAFE, WATCH_LIST, HIGH_RISK, RESTRICTED, CRITICAL)
 * 2. Multi-Signal Aggregation across all 15 input vectors
 * 3. Single-Signal Safeguard (Cap at 40 penalty for isolated categories)
 * 4. Policy Decision Matrix & Action Enforcement (Upload/Comment Cooldowns & Suspension)
 * 5. Organic Score Recovery & Clamping [0, 100]
 * 6. Appeal Lifecycle (Filing, Review, Approval +30 Recovery, Rejection)
 * 7. Safe Explainability (User vs Admin Telemetry Views)
 */

import { guardianService } from '../server/moderation/guardianService';
import { GuardianEventType, GuardianRiskLevel } from '../server/moderation/types';

// Test Runner Infrastructure
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

async function runGuardianEngineTests() {
  console.log('================================================================');
  console.log('      VERIXA AI Guardian Mode Central Risk Engine Tests         ');
  console.log('================================================================\n');

  // ============================================================================
  // TEST GROUP 1: BASELINE SCORE & RISK TIERS
  // ============================================================================
  console.log('--- 1. Baseline Score & Risk Tier Mapping ---');

  const cleanUserId = `user_clean_${Date.now()}`;
  const cleanScore = await guardianService.getGuardianScore(cleanUserId);

  assert(cleanScore.guardian_score === 100, 'New user initializes at baseline 100');
  assert(cleanScore.score === 100, 'Ergonomic alias .score matches 100');
  assert(cleanScore.risk_level === 'SAFE', 'Baseline user risk level is SAFE');
  assert(cleanScore.confidence === 100, 'Baseline confidence is 100%');

  // Check action allowance for clean user
  const cleanActionCheck = await guardianService.checkActionAllowed(cleanUserId, 'post');
  assert(cleanActionCheck.allowed === true, 'Clean user is permitted to post');
  assert(cleanActionCheck.risk_level === 'SAFE', 'Action check reflects SAFE risk level');

  // Guest users bypass
  const guestCheck = await guardianService.checkActionAllowed('user_guest', 'post');
  assert(guestCheck.allowed === true, 'Guest users are allowed by default');

  // Risk Level Threshold Helper
  assert(guardianService.getRiskLevel(100) === 'SAFE', '100 is SAFE');
  assert(guardianService.getRiskLevel(80) === 'SAFE', '80 is SAFE');
  assert(guardianService.getRiskLevel(79) === 'WATCH_LIST', '79 is WATCH_LIST');
  assert(guardianService.getRiskLevel(60) === 'WATCH_LIST', '60 is WATCH_LIST');
  assert(guardianService.getRiskLevel(59) === 'HIGH_RISK', '59 is HIGH_RISK');
  assert(guardianService.getRiskLevel(40) === 'HIGH_RISK', '40 is HIGH_RISK');
  assert(guardianService.getRiskLevel(39) === 'RESTRICTED', '39 is RESTRICTED');
  assert(guardianService.getRiskLevel(20) === 'RESTRICTED', '20 is RESTRICTED');
  assert(guardianService.getRiskLevel(19) === 'CRITICAL', '19 is CRITICAL');
  assert(guardianService.getRiskLevel(0) === 'CRITICAL', '0 is CRITICAL');

  // ============================================================================
  // TEST GROUP 2: SINGLE-SIGNAL SAFEGUARD (ISOLATION PROTECTION CAP)
  // ============================================================================
  console.log('\n--- 2. Single-Signal Safeguard (Multi-Signal Protection) ---');

  const singleSignalUserId = `user_single_signal_${Date.now()}`;

  // Fire multiple severe events of ONLY ONE category (SPAM)
  for (let i = 0; i < 5; i++) {
    await guardianService.recordGuardianEvent({
      userId: singleSignalUserId,
      eventType: 'SPAM_DETECTED',
      severity: 'high',
      weight: 20, // raw sum = 100 penalty
      source: 'spam_engine',
      reason: `Spam incident ${i + 1}`,
    });
  }

  const singleSignalScore = await guardianService.getGuardianScore(singleSignalUserId);

  // Without cap, score would be 0 (CRITICAL). With single-signal protection cap of 40, score must be >= 60
  assert(
    singleSignalScore.guardian_score >= 60,
    'Single-signal isolation cap prevents penalty exceeding 40',
    `Expected >= 60, got ${singleSignalScore.guardian_score}`
  );
  assert(
    singleSignalScore.risk_level === 'WATCH_LIST',
    'User with only a single violation category cannot drop into RESTRICTED or CRITICAL',
    `Expected WATCH_LIST, got ${singleSignalScore.risk_level}`
  );

  // ============================================================================
  // TEST GROUP 3: MULTI-SIGNAL AGGREGATION ACROSS INPUT VECTORS
  // ============================================================================
  console.log('\n--- 3. Multi-Signal Aggregation across 15 Vectors ---');

  const multiSignalUserId = `user_multi_${Date.now()}`;

  // Vector 1: Toxicity Spike
  await guardianService.recordGuardianEvent({
    userId: multiSignalUserId,
    eventType: 'TOXICITY_SPIKE',
    severity: 'medium',
    weight: 12,
    source: 'ai_moderator',
    reason: 'Toxic comment pattern',
  });

  // Vector 2: Cyberbullying
  await guardianService.recordGuardianEvent({
    userId: multiSignalUserId,
    eventType: 'CYBERBULLYING',
    severity: 'high',
    weight: 20,
    source: 'cyberbullying_service',
    reason: 'Targeted hostile interactions',
  });

  // Vector 3: NSFW Upload Attempt
  await guardianService.recordGuardianEvent({
    userId: multiSignalUserId,
    eventType: 'NSFW_UPLOAD_ATTEMPT',
    severity: 'high',
    weight: 18,
    source: 'media_safety_engine',
    reason: 'Adult content detection',
  });

  // Vector 4: Deepfake Risk
  await guardianService.recordGuardianEvent({
    userId: multiSignalUserId,
    eventType: 'DEEPFAKE_HIGH_RISK',
    severity: 'high',
    weight: 14,
    source: 'media_safety_engine',
    reason: 'Synthetic media without disclosure',
  });

  // Vector 5: Privacy Violation
  await guardianService.recordGuardianEvent({
    userId: multiSignalUserId,
    eventType: 'PRIVACY_VIOLATION',
    severity: 'medium',
    weight: 8,
    source: 'privacy_scanner',
    reason: 'Doxxing attempt',
  });

  const multiScore = await guardianService.getGuardianScore(multiSignalUserId);

  assert(
    multiScore.guardian_score <= 30,
    'Corroborating violations across multiple vectors reduce score significantly',
    `Score: ${multiScore.guardian_score}`
  );
  assert(
    multiScore.risk_level === 'RESTRICTED' || multiScore.risk_level === 'CRITICAL',
    'Multi-signal risk level transitions to RESTRICTED or CRITICAL',
    `Risk level: ${multiScore.risk_level}`
  );

  // ============================================================================
  // TEST GROUP 4: POLICY DECISION MATRIX & ACTION ENFORCEMENT
  // ============================================================================
  console.log('\n--- 4. Policy Decision Matrix & Action Enforcement ---');

  // In RESTRICTED tier: upload cooldown (300s) and comment cooldown (60s)
  const restrictedCheck = await guardianService.checkActionAllowed(multiSignalUserId, 'post');
  assert(
    restrictedCheck.allowed === false,
    'Restricted user cannot post immediately upon restriction trigger',
    restrictedCheck.restriction
  );
  assert(
    (restrictedCheck.cooldown_seconds_remaining || 0) > 0,
    'Cooldown remaining seconds reported accurately'
  );
  assert(
    restrictedCheck.appeal_available === true,
    'Appeal option is available under restricted tier'
  );

  // Test Critical Tier Suspension
  const criticalUserId = `user_critical_${Date.now()}`;
  // Feed 4 distinct severe categories
  const severeTypes: GuardianEventType[] = [
    'HATE_SPEECH',
    'CYBERBULLYING',
    'NSFW_UPLOAD_ATTEMPT',
    'FAKE_ACCOUNT_SIGNAL',
  ];
  for (const t of severeTypes) {
    await guardianService.recordGuardianEvent({
      userId: criticalUserId,
      eventType: t,
      severity: 'critical',
      weight: 25,
      source: 'safety_matrix',
      reason: `Severe violation: ${t}`,
    });
  }

  const criticalScore = await guardianService.getGuardianScore(criticalUserId);
  assert(
    criticalScore.risk_level === 'CRITICAL',
    'Multiple critical corroborating violations result in CRITICAL tier',
    `Risk level: ${criticalScore.risk_level}, Score: ${criticalScore.guardian_score}`
  );

  const criticalCheck = await guardianService.checkActionAllowed(criticalUserId, 'post');
  assert(criticalCheck.allowed === false, 'Critical user publishing is suspended');
  assert(
    criticalCheck.restriction?.includes('Suspension') || false,
    'Suspension message is communicated clearly'
  );

  // ============================================================================
  // TEST GROUP 5: ORGANIC SCORE RECOVERY & CLAMPING
  // ============================================================================
  console.log('\n--- 5. Organic Score Recovery & Clamping ---');

  const recoveryUserId = `user_rec_${Date.now()}`;

  // Initial infractions to drop to WATCH_LIST
  await guardianService.recordGuardianEvent({
    userId: recoveryUserId,
    eventType: 'SPAM_DETECTED',
    severity: 'medium',
    weight: 25,
    source: 'spam_engine',
    reason: 'Rapid commenting',
  });

  const preRecovery = await guardianService.getGuardianScore(recoveryUserId);
  const scoreBefore = preRecovery.guardian_score;
  assert(scoreBefore === 75, 'Score drops to 75');

  // Positive community engagement events (+3 each)
  for (let i = 0; i < 5; i++) {
    await guardianService.recordGuardianEvent({
      userId: recoveryUserId,
      eventType: 'POSITIVE_COMMUNITY_ENGAGEMENT',
      severity: 'low',
      weight: -3, // positive credit
      source: 'engagement_tracker',
      reason: 'Constructive community participation',
    });
  }

  // Time decay recovery credit (+8)
  await guardianService.recordGuardianEvent({
    userId: recoveryUserId,
    eventType: 'RECOVERY_TIME_DECAY',
    severity: 'low',
    weight: -8,
    source: 'time_decay_engine',
    reason: 'Clean behavior window achieved',
  });

  const postRecovery = await guardianService.getGuardianScore(recoveryUserId);
  assert(
    postRecovery.guardian_score > scoreBefore,
    'Positive community engagement organically recovers score',
    `Was ${scoreBefore}, now ${postRecovery.guardian_score}`
  );
  assert(
    postRecovery.guardian_score <= 100,
    'Guardian score is clamped at maximum 100'
  );

  // Over-recovery clamp check
  for (let i = 0; i < 20; i++) {
    await guardianService.recordGuardianEvent({
      userId: recoveryUserId,
      eventType: 'POSITIVE_COMMUNITY_ENGAGEMENT',
      severity: 'low',
      weight: -10,
      source: 'engagement_tracker',
      reason: 'Extra positive action',
    });
  }
  const clampedScore = await guardianService.getGuardianScore(recoveryUserId);
  assert(clampedScore.guardian_score === 100, 'Score is strictly clamped at 100');

  // ============================================================================
  // TEST GROUP 6: APPEAL LIFECYCLE & +30 RECOVERY
  // ============================================================================
  console.log('\n--- 6. Appeal Filing, Resolution, and +30 Recovery ---');

  const appealUserId = `user_appeal_${Date.now()}`;

  // Make user RESTRICTED with 2 categories
  await guardianService.recordGuardianEvent({
    userId: appealUserId,
    eventType: 'HATE_SPEECH',
    severity: 'high',
    weight: 35,
    source: 'ai_moderator',
    reason: 'Flagged comment',
  });
  await guardianService.recordGuardianEvent({
    userId: appealUserId,
    eventType: 'CYBERBULLYING',
    severity: 'high',
    weight: 35,
    source: 'cyberbullying_detector',
    reason: 'Multiple flags',
  });

  const appealUserScore = await guardianService.getGuardianScore(appealUserId);
  assert(appealUserScore.risk_level === 'RESTRICTED', 'User placed in RESTRICTED tier');

  // 6.1 Submit Appeal
  const submittedAppeal = await guardianService.submitAppeal(
    appealUserId,
    'Dispute False Positive',
    'My comment was academic analysis, not harassment. Please review context.'
  );

  assert(submittedAppeal.status === 'PENDING', 'New appeal is in PENDING state');
  assert(submittedAppeal.user_id === appealUserId, 'Appeal references correct user ID');

  const pendingList = guardianService.getPendingAppeals();
  assert(
    pendingList.some((a) => a.id === submittedAppeal.id),
    'Submitted appeal appears in pending queue'
  );

  // 6.2 Resolve Appeal with Approval (+30 recovery)
  const scoreBeforeApproval = appealUserScore.guardian_score;
  const resolutionResult = await guardianService.resolveAppeal(
    submittedAppeal.id,
    'approve',
    'admin_moderator',
    'Context confirmed as benign discussion. Sanction overturned.'
  );

  assert(resolutionResult.success === true, 'Appeal approval executes successfully');
  assert(resolutionResult.scoreDelta === 30, 'Approval awards exactly +30 score recovery');

  const scoreAfterApproval = await guardianService.getGuardianScore(appealUserId);
  assert(
    scoreAfterApproval.guardian_score === scoreBeforeApproval + 30,
    'User score is credited by +30 points upon approved appeal',
    `Before: ${scoreBeforeApproval}, After: ${scoreAfterApproval.guardian_score}`
  );

  const restrictionsAfter = await guardianService.getActiveRestrictions(appealUserId);
  assert(
    restrictionsAfter.appeal_status === 'APPROVED',
    'Restriction record reflects APPROVED appeal status'
  );
  assert(
    restrictionsAfter.account_suspended === false,
    'Suspension lifted upon appeal approval'
  );

  // 6.3 Test Appeal Rejection
  const rejectUserId = `user_reject_${Date.now()}`;
  await guardianService.recordGuardianEvent({
    userId: rejectUserId,
    eventType: 'SPAM_DETECTED',
    severity: 'high',
    weight: 30,
    source: 'spam_engine',
    reason: 'Automated spam bot activity',
  });

  const rejectedAppeal = await guardianService.submitAppeal(
    rejectUserId,
    'General Safety Restoration',
    'Please unblock me.'
  );
  const rejectResult = await guardianService.resolveAppeal(
    rejectedAppeal.id,
    'reject',
    'admin_moderator',
    'Sufficient evidence of repeated bot-like behavior confirmed.'
  );

  assert(rejectResult.success === true, 'Appeal rejection handled successfully');
  assert(rejectResult.scoreDelta === 0, 'No score delta awarded on rejected appeal');

  // ============================================================================
  // TEST GROUP 7: SAFE EXPLAINABILITY (USER VS ADMIN TELEMETRY)
  // ============================================================================
  console.log('\n--- 7. Safe Explainability Breakdown ---');

  const explainUserId = `user_explain_${Date.now()}`;
  await guardianService.recordGuardianEvent({
    userId: explainUserId,
    eventType: 'TOXICITY_SPIKE',
    severity: 'medium',
    weight: 15,
    source: 'ai_moderator',
    reason: 'Toxic comment attempt',
  });
  await guardianService.recordGuardianEvent({
    userId: explainUserId,
    eventType: 'POSITIVE_COMMUNITY_ENGAGEMENT',
    severity: 'low',
    weight: -4,
    source: 'community_helper',
    reason: 'Helpful reply',
  });

  // 7.1 Regular User View (Safe Explainability)
  const userExplainability = await guardianService.getExplainability(explainUserId, false);
  assert(userExplainability.factors.length > 0, 'Explainability contains factor list');
  assert(userExplainability.summary.length > 0, 'Explainability contains human-readable summary');
  assert(userExplainability.recovery_tips.length > 0, 'Explainability contains actionable recovery tips');
  assert(
    userExplainability.detailed_signals === undefined,
    'Internal raw telemetry (detailed_signals) is stripped for regular users'
  );
  assert(userExplainability.is_admin_view === false, 'is_admin_view is false for user request');

  // 7.2 Admin View (Full Audit Telemetry)
  const adminExplainability = await guardianService.getExplainability(explainUserId, true);
  assert(
    adminExplainability.detailed_signals !== undefined,
    'Internal raw telemetry (detailed_signals) is provided for admins'
  );
  assert(
    adminExplainability.detailed_signals.window_days === 14,
    'Admin view telemetry reports 14-day evaluation window'
  );
  assert(adminExplainability.is_admin_view === true, 'is_admin_view is true for admin request');

  // ============================================================================
  // TEST SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`Test Execution Finished: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runGuardianEngineTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
