import {
  normalizeUnicode,
  removeZeroWidthChars,
  normalizeHomoglyphs,
  normalizeLeetspeak,
  normalizeRepeatedChars,
  normalizeText,
} from '../server/moderation/normalizer';
import { detectLanguage } from '../server/moderation/languageDetector';
import { evaluateSecondarySafety } from '../server/moderation/secondarySafetyRules';
import { moderationGateway } from '../server/moderation/moderationGateway';
import { NormalizedModerationResponse } from '../server/moderation/types';

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

async function runTests() {
  console.log('===========================================================');
  console.log('  VERIXA Multilingual NLP Moderation Automated Test Suite  ');
  console.log('===========================================================\n');

  // -------------------------------------------------------------
  // Section 1: Normalization Pipeline Unit Tests
  // -------------------------------------------------------------
  console.log('--- 1. Normalization Pipeline Stages ---');

  // 1.1 Unicode Normalization (NFKC)
  const fullWidth = 'Ｈｅｌｌｏ';
  assert(normalizeUnicode(fullWidth) === 'Hello', 'Unicode NFKC converts full-width characters');

  // 1.2 Zero-Width Character Removal
  const zeroWidthText = 'f\u200Bu\u200Cc\u200Dk\uFEFF';
  assert(removeZeroWidthChars(zeroWidthText) === 'fuck', 'Zero-width characters and BOM stripped');

  // 1.3 Homoglyph Normalization
  const cyrillicHomoglyph = 'fаggоt'; // Cyrillic 'а' (\u0430) and 'о' (\u043e)
  assert(normalizeHomoglyphs(cyrillicHomoglyph) === 'faggot', 'Cyrillic homoglyphs normalized to Latin');

  // 1.4 Leetspeak Normalization
  const leetText = 'k!ll y0ur$3lf';
  assert(normalizeLeetspeak(leetText) === 'kill yourself', 'Leetspeak symbols (@, 0, $, !, 3) normalized to alphabet');

  // 1.5 Repeated Characters Normalization
  const elongatedText = 'fuuuuuckk denguuuuu';
  assert(normalizeRepeatedChars(elongatedText) === 'fuuckk denguu', 'Elongated repeated characters collapsed');

  // 1.6 Full Normalization Pipeline
  const evasionAttempt = 'k\u200B!ll\u200C y0ur$elf';
  const normResult = normalizeText(evasionAttempt);
  assert(
    normResult.normalized.includes('kill') && normResult.normalized.includes('yourself'),
    'Full sequential pipeline normalizes combined zero-width + leetspeak'
  );
  assert(Boolean(normResult.stages.unicodeNormalized), 'Normalizer exposes unicodeNormalized stage');
  assert(Boolean(normResult.stages.zeroWidthRemoved), 'Normalizer exposes zeroWidthRemoved stage');
  assert(Boolean(normResult.stages.homoglyphsNormalized), 'Normalizer exposes homoglyphsNormalized stage');
  assert(Boolean(normResult.stages.leetspeakNormalized), 'Normalizer exposes leetspeakNormalized stage');
  assert(Boolean(normResult.stages.repeatedCharsNormalized), 'Normalizer exposes repeatedCharsNormalized stage');

  console.log('');

  // -------------------------------------------------------------
  // Section 2: Multilingual Language Detection Tests
  // -------------------------------------------------------------
  console.log('--- 2. Language Detection across 5 Languages + Mixed ---');

  // 2.1 English
  const engDet = detectLanguage('Hello my friend, hope you are having a wonderful day!');
  assert(engDet.primaryLanguage === 'English', 'Detects standard English');

  // 2.2 Telugu - Native Script
  const telNativeDet = detectLanguage('నువ్వు చాలా మంచి వాడివి, ధన్యవాదాలు మిత్రమా');
  assert(telNativeDet.primaryLanguage === 'Telugu', 'Detects Telugu Native Script (తెలుగు)');

  // 2.3 Telugu - Transliterated (Tenglish)
  const telTransDet = detectLanguage('nuvvu chala bagunnavu bro chala thanks');
  assert(telTransDet.primaryLanguage === 'Telugu' && telTransDet.isTransliterated, 'Detects Telugu Transliterated (Tenglish)');

  // 2.4 Hindi - Native Script (Devanagari)
  const hinNativeDet = detectLanguage('आप बहुत अच्छे इंसान हैं, धन्यवाद भाई');
  assert(hinNativeDet.primaryLanguage === 'Hindi', 'Detects Hindi Native Script (देवनागरी)');

  // 2.5 Hindi - Transliterated (Hinglish)
  const hinTransDet = detectLanguage('tu mera bohot achha dost hai bhai');
  assert(hinTransDet.primaryLanguage === 'Hindi' && hinTransDet.isTransliterated, 'Detects Hindi Transliterated (Hinglish)');

  // 2.6 Urdu - Native Script (Nastaliq/Arabic)
  const urduNativeDet = detectLanguage('آپ کا بہت شکریہ جناب خوش رہیں');
  assert(urduNativeDet.primaryLanguage === 'Urdu', 'Detects Urdu Native Script (اردو)');

  // 2.7 Urdu - Transliterated (Roman Urdu)
  const urduTransDet = detectLanguage('aap bohot ache insaan hain shukriya janaab');
  assert(urduTransDet.primaryLanguage === 'Urdu' && urduTransDet.isTransliterated, 'Detects Urdu Transliterated (Roman Urdu)');

  // 2.8 Tamil - Native Script
  const tamNativeDet = detectLanguage('வணக்கம் நண்பா எப்படி இருக்கீங்க வாழ்த்துக்கள்');
  assert(tamNativeDet.primaryLanguage === 'Tamil', 'Detects Tamil Native Script (தமிழ்)');

  // 2.9 Tamil - Transliterated (Tanglish)
  const tamTransDet = detectLanguage('vanakkam thambi romba nalla padam super');
  assert(tamTransDet.primaryLanguage === 'Tamil' && tamTransDet.isTransliterated, 'Detects Tamil Transliterated (Tanglish)');

  // 2.10 Mixed-Language (English + Hindi)
  const mixedDet = detectLanguage('Hey bro stop this, tu bohot achha developer hai');
  assert(mixedDet.isMixed || mixedDet.languageDetected.includes('Mixed') || mixedDet.detectedLanguages.length > 1, 'Detects Mixed-Language code-switching');

  console.log('');

  // -------------------------------------------------------------
  // Section 3: Secondary Safety Rules (Defense-in-Depth Layer)
  // -------------------------------------------------------------
  console.log('--- 3. Secondary Safety Rules (Cross-Lingual Guardrails) ---');

  // 3.1 Phishing Detection
  const phishingHit = evaluateSecondarySafety('Claim free crypto airdrop now at https://bit.ly/crypto-scam', '', '');
  assert(phishingHit.matched && phishingHit.category === 'Phishing/link abuse', 'Catches phishing link abuse');

  // 3.2 Spam Detection
  const spamHit = evaluateSecondarySafety('follow back follow back follow back check my bio', '', '');
  assert(spamHit.matched && spamHit.category === 'Spam', 'Catches repetitive spam promotion');

  // 3.3 Violent Threat Detection (English)
  const engThreatHit = evaluateSecondarySafety('I will murder you and hunt you down', '', '');
  assert(engThreatHit.matched && engThreatHit.category === 'Threats', 'Catches violent threats in English');

  // 3.4 Telugu Threat Detection
  const telThreatHit = evaluateSecondarySafety('ninnu champestha ra chachipo', '', '');
  assert(telThreatHit.matched && telThreatHit.category === 'Threats', 'Catches Telugu violent death threat');

  // 3.5 Hindi Threat Detection
  const hinThreatHit = evaluateSecondarySafety('tujhe jaan se maar dunga kutte', '', '');
  assert(hinThreatHit.matched && hinThreatHit.category === 'Threats', 'Catches Hindi violent death threat');

  // 3.6 Tamil Threat Detection
  const tamThreatHit = evaluateSecondarySafety('unakku konnuduven seththu po', '', '');
  assert(tamThreatHit.matched && tamThreatHit.category === 'Threats', 'Catches Tamil violent death threat');

  // 3.7 Zero-Tolerance Telugu Slur (Tenglish)
  const telSlurHit = evaluateSecondarySafety('nuvvu pedda lanjakodaka vi', 'nuvvu pedda lanjakodaka vi', 'nuvvupeddalanjakodakavi');
  assert(telSlurHit.matched, 'Catches Telugu zero-tolerance slur (Tenglish)');

  // 3.8 Zero-Tolerance Hindi Slur (Hinglish)
  const hinSlurHit = evaluateSecondarySafety('tu madarchod hai', 'tu madarchod hai', 'tumadarchodhai');
  assert(hinSlurHit.matched, 'Catches Hindi zero-tolerance slur (Hinglish)');

  // 3.9 Zero-Tolerance Tamil Slur (Tanglish)
  const tamSlurHit = evaluateSecondarySafety('thevidiya payale', 'thevidiya payale', 'thevidiyapayale');
  assert(tamSlurHit.matched, 'Catches Tamil zero-tolerance slur (Tanglish)');

  // 3.10 Zero-Tolerance Urdu Slur (Roman Urdu)
  const urduSlurHit = evaluateSecondarySafety('kuttay ke bachay beghairat', 'kuttay ke bachay beghairat', 'kuttaykebachaybeghairat');
  assert(urduSlurHit.matched, 'Catches Urdu zero-tolerance attack (Roman Urdu)');

  console.log('');

  // -------------------------------------------------------------
  // Section 4: End-to-End Moderation Gateway Pipeline
  // -------------------------------------------------------------
  console.log('--- 4. End-to-End Moderation Gateway Pipeline ---');

  const testCases: Array<{
    label: string;
    text: string;
    expectedAllowed: boolean;
    expectedCategory?: string;
    expectedLanguagePattern?: RegExp;
  }> = [
    // 4.1 Safe English
    {
      label: 'English Safe Comment',
      text: 'Great video! Thank you for sharing this inspiring tutorial.',
      expectedAllowed: true,
      expectedLanguagePattern: /English/i,
    },
    // 4.2 Safe Positive Regional Idiom (slang words like "killing it", "fire")
    {
      label: 'English Positive Idiom (killing it)',
      text: 'Damn this tutorial is killing it! Awesome work bro 🔥',
      expectedAllowed: true,
      expectedLanguagePattern: /English/i,
    },
    // 4.3 English Threat
    {
      label: 'English Violent Threat',
      text: 'I will find you and murder your family you disgusting animal',
      expectedAllowed: false,
      expectedCategory: 'Threats',
      expectedLanguagePattern: /English/i,
    },
    // 4.4 Telugu Native Script Toxic Threat
    {
      label: 'Telugu Native Script Threat',
      text: 'నువ్వు ఒక పెద్ద లంజా కొడుకువి, నిన్ను చంపేస్తా',
      expectedAllowed: false,
      expectedLanguagePattern: /Telugu/i,
    },
    // 4.5 Telugu Transliterated (Tenglish) Toxic Insult
    {
      label: 'Telugu Tenglish Abuse',
      text: 'nuvvu pedda lanjakodaka vi ninnu champestha ra',
      expectedAllowed: false,
      expectedLanguagePattern: /Telugu/i,
    },
    // 4.6 Hindi Devanagari Script Threat
    {
      label: 'Hindi Devanagari Threat',
      text: 'तू सबसे बड़ा चूतिया है, मैं तुझे जान से मार दूंगा',
      expectedAllowed: false,
      expectedLanguagePattern: /Hindi/i,
    },
    // 4.7 Hindi Transliterated (Hinglish) Toxic Abuse
    {
      label: 'Hindi Hinglish Slur & Threat',
      text: 'tu sabse bada chutiya hai tera murder kar dunga mar ja',
      expectedAllowed: false,
      expectedLanguagePattern: /Hindi/i,
    },
    // 4.8 Urdu Native Script Threat
    {
      label: 'Urdu Native Script Attack',
      text: 'تم کتے کے بچے ہو بے غیرت انسان، میں تمہیں جان سے مار دوں گا',
      expectedAllowed: false,
      expectedLanguagePattern: /Urdu/i,
    },
    // 4.9 Urdu Roman Urdu Abuse
    {
      label: 'Urdu Roman Urdu Attack',
      text: 'tum kuttay ke bachay ho beghairat insaan, jaan se maar dunga',
      expectedAllowed: false,
      expectedLanguagePattern: /Urdu/i,
    },
    // 4.10 Tamil Native Script Threat
    {
      label: 'Tamil Native Script Abuse',
      text: 'தேவிடியா பையன் உன்னை கொன்னுடுவேன் செத்துப்போடா',
      expectedAllowed: false,
      expectedLanguagePattern: /Tamil/i,
    },
    // 4.11 Tamil Transliterated (Tanglish) Abuse
    {
      label: 'Tamil Tanglish Abuse & Threat',
      text: 'thevidiya payale un mandaya udaippaen konnuduven',
      expectedAllowed: false,
      expectedLanguagePattern: /Tamil/i,
    },
    // 4.12 Mixed-Language (English + Hindi)
    {
      label: 'Mixed-Language (Hinglish + English) Attack',
      text: 'Hey bro stop this, tu bahut bada chutiya loser hai go die in a fire',
      expectedAllowed: false,
      expectedLanguagePattern: /(Hindi|Mixed|English)/i,
    },
    // 4.13 Obfuscated Leetspeak & Spaced
    {
      label: 'Obfuscated Leetspeak Death Threat',
      text: 'k!ll y0ur$elf n0w f u c k this creator',
      expectedAllowed: false,
      expectedLanguagePattern: /English/i,
    },
    // 4.14 Zero-Width Obfuscation
    {
      label: 'Zero-Width Character Obfuscation Attack',
      text: 'i\u200B \u200Cwill\u200D \uFEFFmurder you',
      expectedAllowed: false,
      expectedCategory: 'Threats',
    },
    // 4.15 Phishing Link Abuse
    {
      label: 'Phishing Link Abuse',
      text: 'Free giftcard giveaway! Claim here: https://bit.ly/claim-free-nitro-now',
      expectedAllowed: false,
      expectedCategory: 'Phishing/link abuse',
    },
    // 4.16 Spam Manipulation
    {
      label: 'Spam Engagement Manipulation',
      text: 'follow back follow back follow back dm for promo check my bio 🔥💰🚀',
      expectedAllowed: false,
      expectedCategory: 'Spam',
    },
  ];

  for (const tc of testCases) {
    const result: NormalizedModerationResponse = await moderationGateway.moderate({
      content: tc.text,
      content_type: 'comment',
      context: 'automated test',
    });

    // 1. Verify Allowed / Blocked status matches expectation
    assert(
      result.allowed === tc.expectedAllowed,
      `${tc.label} -> Allowed status correct (${result.allowed ? 'ALLOWED' : 'BLOCKED/QUARANTINED'}, decision=${result.decision})`
    );

    // 2. Verify all required fields are exposed
    assert(
      typeof result.language_detected === 'string' && result.language_detected.length > 0,
      `${tc.label} -> language_detected exposed ("${result.language_detected}")`
    );

    assert(
      typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 100,
      `${tc.label} -> confidence exposed (${result.confidence}%)`
    );

    assert(
      typeof result.toxicity_score === 'number' && result.toxicity_score >= 0 && result.toxicity_score <= 100,
      `${tc.label} -> toxicity_score exposed (${result.toxicity_score}%)`
    );

    assert(
      Array.isArray(result.categories) && result.categories.length > 0,
      `${tc.label} -> categories exposed ([${result.categories.join(', ')}])`
    );

    assert(
      typeof result.reason === 'string' && result.reason.length > 0,
      `${tc.label} -> reason exposed ("${result.reason.slice(0, 50)}...")`
    );

    if (!result.allowed) {
      assert(
        result.safe_rewrite !== undefined,
        `${tc.label} -> safe_rewrite field present on blocked response`
      );
    }

    if (tc.expectedLanguagePattern) {
      assert(
        tc.expectedLanguagePattern.test(result.language_detected) ||
        tc.expectedLanguagePattern.test(result.language),
        `${tc.label} -> language correctly matches ${tc.expectedLanguagePattern} (detected: "${result.language_detected}")`
      );
    }

    // Pacing to avoid burst rate-limiting
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('');

  // -------------------------------------------------------------
  // Section 5: Payload Security & Fail-Closed Gateways
  // -------------------------------------------------------------
  console.log('--- 5. Security & Fail-Closed Behavior ---');

  // 5.1 Huge text payload exceeds 50KB limit
  const hugeString = 'A'.repeat(60 * 1024);
  const sizeFailResult = await moderationGateway.moderate({
    content: hugeString,
    content_type: 'comment',
  });
  assert(sizeFailResult.allowed === false, 'Payload size validation blocks oversized text (>50KB)');
  assert(sizeFailResult.categories.includes('PAYLOAD_TOO_LARGE'), 'Category PAYLOAD_TOO_LARGE assigned on size violation');

  console.log('\n===========================================================');
  console.log(`  Test Suite Completed: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('===========================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run the tests
runTests().catch((err) => {
  console.error('Fatal error running multilingual moderation test suite:', err);
  process.exit(1);
});
