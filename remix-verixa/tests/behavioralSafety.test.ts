/**
 * VERIXA Behavioral Safety Intelligence - Automated Test Suite
 *
 * Comprehensive verification of the 5 independent behavioral safety services:
 * 1. Cyberbullying Detection (Multi-interaction patterns, harassment ratios, escalating hostility, brigading)
 * 2. Spam Detection (Repeated comments/posts, advertising, fake giveaways, referral, link spam, velocity, bots)
 * 3. Fake Account Risk (Observable metrics, probabilistic non-definitive risk scoring)
 * 4. Privacy Scanner (Phone, email, bank account, Aadhaar, Luhn credit cards, redaction)
 * 5. Reputation System (Server-authoritative immutable event ledger, clamping, trust badges)
 */

import { cyberbullyingService } from '../server/moderation/cyberbullyingService';
import { spamService } from '../server/moderation/spamService';
import { fakeAccountService, UserObservableData } from '../server/moderation/fakeAccountService';
import { privacyScanner, luhnCheck } from '../server/moderation/privacyScanner';
import { reputationService } from '../server/moderation/reputationService';
import { scanForSensitiveData, redactSensitiveData } from '../src/lib/privacyScanner';

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

async function runBehavioralSafetyTests() {
  console.log('================================================================');
  console.log('    VERIXA Behavioral Safety Intelligence Automated Tests       ');
  console.log('================================================================\n');

  // ============================================================================
  // SERVICE 1: CYBERBULLYING DETECTION
  // ============================================================================
  console.log('--- 1. Cyberbullying Detection Service ---');

  // 1.1 Benign interaction between different users
  const benignResult = await cyberbullyingService.evaluateInteraction(
    'user_actor_1',
    'user_target_1',
    'Great photo! Thanks for sharing this.',
    5,
    { actorUsername: 'ActorOne', targetUsername: 'TargetOne' }
  );
  assert(!benignResult.has_bullying, 'Benign comment does not trigger bullying flag');
  assert(benignResult.risk_score < 25, 'Benign comment has low risk score (<25)');
  assert(benignResult.patterns_detected.length === 0, 'No bullying patterns detected for benign interaction');

  // 1.2 Self-interaction guard
  const selfResult = await cyberbullyingService.evaluateInteraction(
    'user_self',
    'user_self',
    'I made a mistake in this post',
    30
  );
  assert(!selfResult.has_bullying, 'Self-interaction safely yields has_bullying=false');

  // 1.3 Repeated Attacks across interactions
  // Actor sends consecutive toxic comments to target
  await cyberbullyingService.evaluateInteraction('bully_user_1', 'victim_user_1', 'You are so annoying', 55);
  const repeatedResult = await cyberbullyingService.evaluateInteraction(
    'bully_user_1',
    'victim_user_1',
    'Nobody asked for your opinion here',
    65
  );
  assert(repeatedResult.has_bullying, 'Multiple hostile interactions trigger bullying detection');
  assert(
    repeatedResult.patterns_detected.includes('repeated_attacks'),
    'Pattern repeated_attacks detected on consecutive toxic comments'
  );
  assert(repeatedResult.evidence_references.length >= 2, 'Bullying evidence references retained for each attack');

  // 1.4 Repeated Insults toward same user
  const insultResult1 = await cyberbullyingService.evaluateInteraction(
    'insulter_1',
    'victim_user_2',
    'You are a complete idiot',
    70
  );
  const insultResult2 = await cyberbullyingService.evaluateInteraction(
    'insulter_1',
    'victim_user_2',
    'Shut up you loser',
    80
  );
  assert(
    insultResult2.patterns_detected.includes('repeated_insults'),
    'Pattern repeated_insults detected when recurring derogatory keywords targeted at user'
  );

  // 1.5 Escalating Hostility Gradient
  // Sequence of climbing toxicity scores: 30 -> 52 -> 74 -> 92
  const targetEsc = 'victim_escalation';
  const actorEsc = 'actor_escalation';
  await cyberbullyingService.evaluateInteraction(actorEsc, targetEsc, 'Mild critique', 30);
  await cyberbullyingService.evaluateInteraction(actorEsc, targetEsc, 'You are getting on my nerves', 52);
  await cyberbullyingService.evaluateInteraction(actorEsc, targetEsc, 'You are pathetic and useless', 74);
  const escalatingResult = await cyberbullyingService.evaluateInteraction(
    actorEsc,
    targetEsc,
    'I will make you regret ever posting here clown',
    92
  );
  assert(
    escalatingResult.patterns_detected.includes('escalating_hostility'),
    'Pattern escalating_hostility detected on chronological toxicity escalation gradient'
  );

  // 1.6 Targeted Harassment Focus Ratio (>50% of actor hostility focused on single victim)
  const targetHarass = 'victim_targeted';
  const actorHarass = 'actor_stalker';
  await cyberbullyingService.evaluateInteraction(actorHarass, targetHarass, 'First targeted attack', 60);
  await cyberbullyingService.evaluateInteraction(actorHarass, 'other_random_user', 'Random rude remark', 40);
  await cyberbullyingService.evaluateInteraction(actorHarass, targetHarass, 'Second targeted attack', 65);
  const targetedResult = await cyberbullyingService.evaluateInteraction(
    actorHarass,
    targetHarass,
    'Third targeted attack on same victim',
    70
  );
  assert(
    targetedResult.patterns_detected.includes('targeted_harassment'),
    'Pattern targeted_harassment detected when disproportionate hostility (>50%) focused on target'
  );

  // 1.7 Coordinated Harassment / Brigading (multiple distinct actors attacking target within window)
  const brigadedVictim = 'victim_brigaded';
  await cyberbullyingService.evaluateInteraction('brigader_a', brigadedVictim, 'Get off this app', 60);
  await cyberbullyingService.evaluateInteraction('brigader_b', brigadedVictim, 'Everyone hates you', 65);
  const brigadingResult = await cyberbullyingService.evaluateInteraction(
    'brigader_c',
    brigadedVictim,
    'Leave now loser',
    70
  );
  assert(
    brigadingResult.patterns_detected.includes('coordinated_harassment'),
    'Pattern coordinated_harassment detected when >=3 distinct actors target user in short window'
  );

  // 1.8 Stored Bullying Events Querying
  const storedEvents = cyberbullyingService.getEventsForTarget(brigadedVictim);
  assert(storedEvents.length > 0, 'Stored bullying events successfully retrievable by target userId');
  if (storedEvents.length > 0) {
    const ev = storedEvents[0];
    assert(Boolean(ev.target_user_id), 'Bullying event has valid target_user_id');
    assert(Boolean(ev.actor_user_id), 'Bullying event has valid actor_user_id');
    assert(Array.isArray(ev.evidence_references), 'Bullying event has evidence_references array');
    assert(typeof ev.risk_score === 'number', 'Bullying event has numeric risk_score');
    assert(typeof ev.confidence === 'number', 'Bullying event has numeric confidence');
    assert(Boolean(ev.timestamps?.detected_at), 'Bullying event has valid timestamp');
  }

  console.log('');

  // ============================================================================
  // SERVICE 2: SPAM DETECTION
  // ============================================================================
  console.log('--- 2. Spam Detection Service ---');

  // 2.1 Clean organic message
  const cleanSpamCheck = spamService.evaluateSpam('user_clean', 'Hello everyone, excited to be here!', 'comment');
  assert(!cleanSpamCheck.is_spam, 'Organic friendly comment is not flagged as spam');
  assert(cleanSpamCheck.action_taken === 'allow', 'Organic comment action is "allow"');

  // 2.2 Repeated Comments (Exact & Similar)
  const spammerUser = 'user_spammer_1';
  spamService.evaluateSpam(spammerUser, 'Check out my profile for cool photography tips', 'comment');
  const duplicateCommentCheck = spamService.evaluateSpam(
    spammerUser,
    'Check out my profile for cool photography tips',
    'comment'
  );
  assert(
    duplicateCommentCheck.spam_types.includes('repeated_comments'),
    'Repeated identical comment detected across submissions'
  );
  assert(duplicateCommentCheck.is_spam, 'Duplicate comment flagged as is_spam=true');

  // 2.3 Repeated Posts
  const postSpammer = 'user_post_spammer';
  spamService.evaluateSpam(postSpammer, 'Big discount sale today on our store! Limited items!', 'post');
  const duplicatePostCheck = spamService.evaluateSpam(
    postSpammer,
    'Big discount sale today on our store! Limited items!',
    'post'
  );
  assert(
    duplicatePostCheck.spam_types.includes('repeated_posts'),
    'Repeated identical post detected across submissions'
  );

  // 2.4 Advertising Spam
  const adSpamCheck = spamService.evaluateSpam(
    'user_ad_bot',
    'DM for crypto signals and guaranteed 100x binance profit every day!',
    'comment'
  );
  assert(
    adSpamCheck.spam_types.includes('advertising_spam'),
    'Advertising spam detected with crypto / forex promo keywords'
  );
  assert(adSpamCheck.spam_score >= 40, 'Advertising spam assigns substantial spam score');

  // 2.5 Fake Giveaways
  const giveawayCheck = spamService.evaluateSpam(
    'user_giveaway_bot',
    'Congratulations you won! Cashapp giveaway! First 50 people to dm claim free iphone 16!',
    'comment'
  );
  assert(
    giveawayCheck.spam_types.includes('fake_giveaway'),
    'Fake giveaway / phishing solicitation pattern detected'
  );

  // 2.6 Referral Spam
  const referralCheck = spamService.evaluateSpam(
    'user_ref_spammer',
    'Join our VIP trading channel right now: https://example.com/register?ref=money123',
    'comment'
  );
  assert(
    referralCheck.spam_types.includes('referral_spam'),
    'Referral spam detected from affiliate query parameter'
  );

  // 2.7 Link Spam (URL Stuffing)
  const linkSpamCheck = spamService.evaluateSpam(
    'user_link_spammer',
    'Visit https://a.com and also https://b.com and definitely https://c.com for free downloads',
    'comment'
  );
  assert(
    linkSpamCheck.spam_types.includes('link_spam'),
    'Link spam detected when multiple URLs are stuffed into single submission'
  );

  // 2.8 Abnormal Posting Frequency
  const velocityUser = 'user_speedy';
  const nowTs = Date.now();
  spamService.evaluateSpam(velocityUser, 'Quick comment 1', 'comment', { submissionTimeMs: nowTs });
  spamService.evaluateSpam(velocityUser, 'Quick comment 2', 'comment', { submissionTimeMs: nowTs + 5000 });
  spamService.evaluateSpam(velocityUser, 'Quick comment 3', 'comment', { submissionTimeMs: nowTs + 10000 });
  spamService.evaluateSpam(velocityUser, 'Quick comment 4', 'comment', { submissionTimeMs: nowTs + 15000 });
  const velocityCheck = spamService.evaluateSpam(velocityUser, 'Quick comment 5', 'comment', {
    submissionTimeMs: nowTs + 20000,
  });
  assert(
    velocityCheck.spam_types.includes('abnormal_frequency'),
    'Abnormal frequency detected after rapid successive comments in under 60 seconds'
  );

  // 2.9 Bot-like Behavior (Sub-second latency)
  const botUser = 'user_subsecond_bot';
  spamService.evaluateSpam(botUser, 'Message A', 'comment', { submissionTimeMs: nowTs });
  const botCheck = spamService.evaluateSpam(botUser, 'Message B', 'comment', {
    submissionTimeMs: nowTs + 250, // 250ms delta (< 600ms threshold)
  });
  assert(
    botCheck.spam_types.includes('bot_like_behavior'),
    'Bot-like behavior detected on sub-second submission interval (250ms)'
  );

  console.log('');

  // ============================================================================
  // SERVICE 3: FAKE ACCOUNT RISK EVALUATION
  // ============================================================================
  console.log('--- 3. Fake Account Risk Evaluation Service ---');

  // 3.1 Organic / Established Member Profile
  const authenticUserData: UserObservableData = {
    userId: 'user_authentic_123',
    username: 'sarah_smith',
    createdAt: new Date(Date.now() - 180 * 86400 * 1000), // 180 days old
    postsCount: 45,
    commentsCount: 120,
    followersCount: 350,
    followingCount: 200,
    reportsCount: 0,
    hasCustomAvatar: true,
    hasBio: true,
    recentLoginCount: 4,
  };

  const authenticEvaluation = fakeAccountService.evaluateAccountRisk(authenticUserData);
  assert(authenticEvaluation.risk_level === 'LOW', 'Authentic established profile assigned LOW risk level');
  assert(
    authenticEvaluation.probability_label.includes('Low Risk'),
    'Probabilistic label uses non-definitive phrasing ("Low Risk...")'
  );
  assert(
    authenticEvaluation.trust_classification === 'Likely Authentic Member',
    'Trust classification set to Likely Authentic Member'
  );
  assert(authenticEvaluation.risk_score < 25, 'Authentic account has low risk score (<25)');

  // 3.2 High Risk Inauthentic / Automated Profile
  const suspiciousUserData: UserObservableData = {
    userId: 'user_suspicious_bot',
    username: 'bot_9827364',
    createdAt: new Date(Date.now() - 12 * 3600 * 1000), // 12 hours old
    postsCount: 28, // 56 posts/day!
    commentsCount: 75, // 150 comments/day!
    followersCount: 1,
    followingCount: 850, // Extreme asymmetry
    reportsCount: 4, // Multiple community flags
    hasCustomAvatar: false, // Default avatar
    hasBio: false, // Empty bio
    outboundLikesCount: 250,
    inboundLikesCount: 0,
  };

  const highRiskEvaluation = fakeAccountService.evaluateAccountRisk(suspiciousUserData);
  assert(
    highRiskEvaluation.risk_level === 'HIGH',
    `High-velocity uncustomized fresh account evaluated as HIGH risk (score: ${highRiskEvaluation.risk_score})`
  );
  assert(
    !highRiskEvaluation.probability_label.toLowerCase().includes('is fake'),
    'Compliance: Does NOT definitively state the account is fake'
  );
  assert(
    highRiskEvaluation.probability_label.includes('High Risk Profile'),
    'Probabilistic label: "High Risk Profile for Inauthentic / Automated Behavior"'
  );
  assert(
    highRiskEvaluation.observed_factors.burst_activity_detected === true,
    'Observed factors correctly flag burst_activity_detected'
  );
  assert(
    highRiskEvaluation.observed_factors.followers_count === 1 &&
      highRiskEvaluation.observed_factors.following_count === 850,
    'Observed factors record follower/following metrics accurately'
  );
  assert(
    highRiskEvaluation.risk_indicators.length >= 4,
    'Provides multi-factor risk indicators for transparency'
  );

  // 3.3 Moderate / Fresh Account Profile
  const moderateUserData: UserObservableData = {
    userId: 'user_new_regular',
    username: 'john_doe_new',
    createdAt: new Date(Date.now() - 3 * 86400 * 1000), // 3 days old
    postsCount: 3,
    commentsCount: 12,
    followersCount: 15,
    followingCount: 35,
    reportsCount: 0,
    hasCustomAvatar: true,
    hasBio: true,
  };
  const moderateEval = fakeAccountService.evaluateAccountRisk(moderateUserData);
  assert(
    moderateEval.risk_level === 'LOW' || moderateEval.risk_level === 'MODERATE',
    'Normal fresh account assigned reasonable risk tier (LOW or MODERATE)'
  );

  console.log('');

  // ============================================================================
  // SERVICE 4: PRIVACY SCANNER (PII DETECTION & REDACTION)
  // ============================================================================
  console.log('--- 4. Privacy Scanner Service ---');

  // 4.1 Luhn algorithm unit check
  assert(luhnCheck('4000123456789017') === true, 'Luhn check validates correct 16-digit checksum (4000123456789017)');
  assert(luhnCheck('4000123456789018') === false, 'Luhn check rejects invalid checksum (4000123456789018)');

  // 4.2 Clean text has no sensitive data
  const cleanPrivacy = privacyScanner.scanText('Enjoying a sunny afternoon at Central Park with friends!');
  assert(!cleanPrivacy.has_sensitive_data, 'Clean text detects no sensitive data');
  assert(cleanPrivacy.detections.length === 0, 'Zero detections in clean text');

  // 4.3 Phone Number Detection (Indian, US, E.164)
  const phoneText = 'Call me on +91 9876543210 or my office line (555) 234-5678';
  const phoneScan = privacyScanner.scanText(phoneText);
  assert(phoneScan.has_sensitive_data, 'Detects phone numbers in content');
  assert(phoneScan.detected_types.includes('phone_number'), 'Detected type phone_number identified');
  assert(phoneScan.detections.some((d) => d.type === 'phone_number'), 'PIIDetection records phone entity');

  // 4.4 Email Address Detection
  const emailText = 'Reach out via personal email at user.testing99@gmail.com for details';
  const emailScan = privacyScanner.scanText(emailText);
  assert(emailScan.has_sensitive_data, 'Detects email address in content');
  assert(emailScan.detected_types.includes('email_address'), 'Detected type email_address identified');
  assert(
    emailScan.detections.some((d) => d.raw_match === 'user.testing99@gmail.com'),
    'Exact email match captured in detections'
  );

  // 4.5 Banking Information Detection (IFSC + Account / IBAN)
  const bankText = 'Transfer the funds to IFSC: HDFC0001234 and Account: 987654321012';
  const bankScan = privacyScanner.scanText(bankText);
  assert(bankScan.has_sensitive_data, 'Detects bank account & IFSC info in content');
  assert(bankScan.detected_types.includes('bank_account'), 'Detected type bank_account identified');

  // 4.6 Aadhaar & SSN Detection
  const aadhaarText = 'My verification Aadhaar ID is 4532 9876 1234';
  const aadhaarScan = privacyScanner.scanText(aadhaarText);
  assert(aadhaarScan.has_sensitive_data, 'Detects 12-digit Aadhaar pattern');
  assert(aadhaarScan.detected_types.includes('aadhaar_number'), 'Detected type aadhaar_number identified');

  // 4.7 Credit Card Validation with Luhn
  // A 16-digit card that satisfies Luhn
  const cardText = `Payment card used: 4000-1234-5678-9017`;
  const cardScan = privacyScanner.scanText(cardText);
  assert(cardScan.has_sensitive_data, 'Detects valid Luhn credit card');
  assert(cardScan.detected_types.includes('credit_card'), 'Detected type credit_card identified');

  // Invalid 16-digit order ID should NOT be flagged as credit card
  const randomNumbers = 'Order ID 1234 5678 9012 3456 completed';
  const orderIdScan = privacyScanner.scanText(randomNumbers);
  const cardTypeDetected = orderIdScan.detections.some((d) => d.type === 'credit_card');
  assert(!cardTypeDetected, 'Non-Luhn numbers are not falsely flagged as credit cards');

  // 4.8 Text Redaction
  const piiString = 'Email me at test@example.com or call +91 9876543210';
  const redacted = privacyScanner.redactText(piiString);
  assert(!redacted.includes('test@example.com'), 'Redacted string strips raw email');
  assert(!redacted.includes('9876543210'), 'Redacted string strips raw phone number');
  assert(redacted.includes('XXXX-XXXX') || redacted.includes('[REDACTED'), 'Redacted string inserts safety placeholders');

  // 4.9 Client-side scanner parity verification (src/lib/privacyScanner.ts)
  const clientScanResult = scanForSensitiveData('Call 9876543210 or email test@gmail.com');
  assert(clientScanResult.hasSensitiveData, 'Client-side scanner correctly flags sensitive data');
  assert(clientScanResult.detectedTypes.length >= 2, 'Client-side scanner identifies multiple PII types');
  const clientRedacted = redactSensitiveData('Contact test@gmail.com');
  assert(!clientRedacted.includes('test@gmail.com'), 'Client-side redactSensitiveData scrubs email');

  console.log('');

  // ============================================================================
  // SERVICE 5: REPUTATION SYSTEM (SERVER-AUTHORITATIVE EVENT LEDGER)
  // ============================================================================
  console.log('--- 5. Reputation System & Immutable Event Ledger ---');

  const testRepUser = `user_rep_${Date.now()}`;

  // 5.1 Initial score check
  const initialScore = await reputationService.getScore(testRepUser);
  assert(initialScore === 100, `Initial user score defaults to 100 (got ${initialScore})`);

  // 5.2 Server-authoritative event recording: deduction
  const penaltyEvent = await reputationService.recordEvent({
    userId: testRepUser,
    event: 'SPAM_DETECTED',
    reason: 'Commercial advertising spam detected in comment',
    source: 'spam_engine',
    amount: -15,
    metadata: { violation: 'advertising_spam' },
  });
  assert(penaltyEvent.amount === -15, 'Ledger event records amount (-15)');
  assert(penaltyEvent.event === 'SPAM_DETECTED', 'Ledger event records event identifier (SPAM_DETECTED)');
  assert(penaltyEvent.source === 'spam_engine', 'Ledger event records source (spam_engine)');
  assert(penaltyEvent.new_score === 85, `Score correctly decremented to 85 (got ${penaltyEvent.new_score})`);
  assert(Boolean(penaltyEvent.timestamp), 'Ledger event records ISO timestamp');

  // 5.3 Additional deduction: Cyberbullying penalty
  const bullyPenalty = await reputationService.recordEvent({
    userId: testRepUser,
    event: 'CYBERBULLYING_PENALTY',
    reason: 'Repeated targeted harassment pattern detected',
    source: 'cyberbullying_detector',
    amount: -30,
  });
  assert(bullyPenalty.new_score === 55, `Score decremented from 85 to 55 (got ${bullyPenalty.new_score})`);

  // 5.4 Positive reward: Helpful community report
  const rewardEvent = await reputationService.recordEvent({
    userId: testRepUser,
    event: 'HARASSMENT_REPORT_UPHELD',
    reason: 'Accurate safety report confirmed by moderation engine',
    source: 'admin_review',
    amount: 10,
  });
  assert(rewardEvent.new_score === 65, `Score incremented to 65 (got ${rewardEvent.new_score})`);

  // 5.5 Clamping validation: cannot exceed 100
  const overMaxEvent = await reputationService.recordEvent({
    userId: testRepUser,
    event: 'POST_VERIFIED_SAFE',
    reason: 'Safe media verified',
    source: 'ai_moderator',
    amount: 150, // Massive positive delta
  });
  assert(overMaxEvent.new_score === 100, `Score is clamped at upper bound of 100 (got ${overMaxEvent.new_score})`);

  // 5.6 Clamping validation: cannot drop below 0
  const belowZeroEvent = await reputationService.recordEvent({
    userId: testRepUser,
    event: 'ADMIN_ADJUSTMENT',
    reason: 'Severe platform violations penalty',
    source: 'admin_review',
    amount: -250, // Massive negative delta
  });
  assert(belowZeroEvent.new_score === 0, `Score is clamped at lower bound of 0 (got ${belowZeroEvent.new_score})`);

  // 5.7 Dynamic Trust Badge Calculation
  assert(
    reputationService.calculateTrustBadge(100) === 'Verified Human • 100% Trust',
    'Badge at 100: "Verified Human • 100% Trust"'
  );
  assert(
    reputationService.calculateTrustBadge(85) === 'Trusted Community Member',
    'Badge at 85: "Trusted Community Member"'
  );
  assert(
    reputationService.calculateTrustBadge(70) === 'Standard Member',
    'Badge at 70: "Standard Member"'
  );
  assert(
    reputationService.calculateTrustBadge(45) === 'Review Required • Caution',
    'Badge at 45: "Review Required • Caution"'
  );
  assert(
    reputationService.calculateTrustBadge(10) === 'Restricted Community Access',
    'Badge at 10: "Restricted Community Access"'
  );

  // 5.8 Ledger History and Summary Query
  const history = await reputationService.getHistory(testRepUser);
  assert(history.length >= 5, `Complete ledger history retrievable (${history.length} records)`);
  assert(history[0].id === belowZeroEvent.id, 'History returns newest ledger events first (reverse chronological)');

  const summary = await reputationService.getSummary(testRepUser);
  assert(summary.current_safety_score === 0, 'Summary accurately reflects current score');
  assert(summary.total_events >= 5, 'Summary calculates total ledger event count');
  assert(Boolean(summary.trust_badge), 'Summary provides computed trust badge');
  assert(summary.recent_events.length > 0, 'Summary includes recent event slice');

  console.log('');
  console.log('================================================================');
  console.log(`  Test Suite Completed: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBehavioralSafetyTests().catch((err) => {
  console.error('Fatal error running behavioral safety tests:', err);
  process.exit(1);
});
