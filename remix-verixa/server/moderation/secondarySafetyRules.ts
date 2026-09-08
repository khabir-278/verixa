/**
 * VERIXA Secondary Safety Rules Layer
 *
 * NOTE: As per system requirements, the primary moderation intelligence
 * is the Multilingual NLP model (Gemini). This module serves strictly as
 * a secondary safety layer for defense-in-depth, catching explicit evasion,
 * known zero-tolerance slurs, severe violence threats, spam, and phishing links.
 */

export interface SecondarySafetyHit {
  matched: boolean;
  category?: string;
  language?: string;
  toxicityScore?: number;
  reason?: string;
  ruleId?: string;
}

// Phishing and malicious link patterns
const PHISHING_PATTERNS = [
  /(bit\.ly|tinyurl\.com|t\.me|wa\.me|cutt\.ly|is\.gd|goo\.gl|rb\.gy)\/[a-z0-9_-]+/i,
  /(claim|free|airdrop|verify|giveaway|wallet|seedphrase|bonus|crypto|giftcard|nitro|robux).*(http:\/\/|https:\/\/|www\.)/i,
  /(http:\/\/|https:\/\/)[a-z0-9._-]+\/(login|signin|account-recovery|password-reset|claim|gift)/i,
  /\b(free\s+\$?\d+|earn\s+\$?\d+\s*(\/|per)\s*day|click\s+here\s+to\s+claim|dm\s+me\s+to\s+earn)\b/i,
];

// Repetitive spam patterns
const SPAM_PATTERNS = [
  /(?:(follow\s+back|f4f|follow\s+me|check\s+my\s+bio|dm\s+for\s+promo|promo\s+available)\s*){2,}/i,
  /\b(follow\s+back\s+follow\s+back|dm\s+for\s+promo)\b/i,
  /([!?.🔥💰🎁🚀]{4,}.*){2,}/i,
];

// Violent death threat patterns in English, Telugu, Hindi, Urdu, Tamil
const THREAT_PATTERNS = [
  /\b(i\s*will\s*(kill|murder|hunt|shoot|stab|find|destroy)\s*(you|u))\b/i,
  /\b(die\s*in\s*a\s*fire|go\s*kill\s*yourself|kys|hope\s*you\s*die)\b/i,
  // Hindi / Urdu threats
  /(tujhe|tumhe)\s*(jaan\s*se\s*maar|maar\s*daal|goli\s*maar)/i,
  /(jaan\s*se\s*marunga|mar\s*ja\s*kutte|maar\s*dunga)/i,
  // Telugu threats
  /(ninnu|ninn|neeku)\s*(champestha|narikiparesta|champesthunna|champutha)/i,
  /(chav\s*ra|chachipo|poyyi\s*chavu)/i,
  // Tamil threats
  /(unakku|unai)\s*(konnuduven|kolvaen|vettuven|adichi\s*kolluven)/i,
  /(seththu\s*po|poi\s*saavu)/i,
  // Native scripts
  /[\u0900-\u097F].*(जान\s*से\s*मार|मर\s*जा)/,
  /[\u0C00-\u0C7F].*(చంపేస్తా|చచ్చిపో)/,
  /[\u0B80-\u0BFF].*(செத்துப்போ|கொன்னுடுவேன்)/,
  /[\u0600-\u06FF].*(جان\s*سے\s*مار|مر\s*جاؤ)/,
];

// Secondary vocabulary list for cross-lingual zero-tolerance slurs & abuse
interface KeywordRule {
  term: string;
  category: string;
  language: string;
  score: number;
}

const SECONDARY_KEYWORD_RULES: KeywordRule[] = [
  // --- English ---
  { term: 'nigger', category: 'Hate speech', language: 'English', score: 99 },
  { term: 'nigga', category: 'Hate speech', language: 'English', score: 95 },
  { term: 'faggot', category: 'Hate speech', language: 'English', score: 98 },
  { term: 'cunt', category: 'Sexual harassment', language: 'English', score: 92 },
  { term: 'whore', category: 'Sexual harassment', language: 'English', score: 90 },
  { term: 'slut', category: 'Sexual harassment', language: 'English', score: 90 },

  // --- Telugu Native Script ---
  { term: 'లంజ', category: 'Sexual harassment', language: 'Telugu', score: 96 },
  { term: 'లంజా', category: 'Sexual harassment', language: 'Telugu', score: 96 },
  { term: 'దెంగు', category: 'Obscene language', language: 'Telugu', score: 94 },
  { term: 'మొడ్డ', category: 'Obscene language', language: 'Telugu', score: 94 },
  { term: 'పూకు', category: 'Sexual harassment', language: 'Telugu', score: 95 },
  { term: 'బోసిడికే', category: 'Harassment', language: 'Telugu', score: 92 },
  { term: 'చెత్త నా కొడకా', category: 'Personal attacks', language: 'Telugu', score: 92 },

  // --- Telugu Transliterated (Tenglish) ---
  { term: 'lanja', category: 'Sexual harassment', language: 'Telugu (Tenglish)', score: 95 },
  { term: 'lanjodaka', category: 'Personal attacks', language: 'Telugu (Tenglish)', score: 96 },
  { term: 'lanjakodaka', category: 'Personal attacks', language: 'Telugu (Tenglish)', score: 96 },
  { term: 'dengu', category: 'Obscene language', language: 'Telugu (Tenglish)', score: 92 },
  { term: 'dengutha', category: 'Sexual harassment', language: 'Telugu (Tenglish)', score: 94 },
  { term: 'modda', category: 'Obscene language', language: 'Telugu (Tenglish)', score: 94 },
  { term: 'puku', category: 'Sexual harassment', language: 'Telugu (Tenglish)', score: 95 },
  { term: 'pukoda', category: 'Personal attacks', language: 'Telugu (Tenglish)', score: 92 },
  { term: 'picchi pukoda', category: 'Bullying', language: 'Telugu (Tenglish)', score: 94 },
  { term: 'vedhava', category: 'Personal attacks', language: 'Telugu (Tenglish)', score: 85 },
  { term: 'chetha na kodaka', category: 'Personal attacks', language: 'Telugu (Tenglish)', score: 92 },

  // --- Hindi Native Script ---
  { term: 'चूतिया', category: 'Harassment', language: 'Hindi', score: 92 },
  { term: 'मादरचोद', category: 'Sexual harassment', language: 'Hindi', score: 98 },
  { term: 'बहनचोद', category: 'Sexual harassment', language: 'Hindi', score: 97 },
  { term: 'रांडी', category: 'Sexual harassment', language: 'Hindi', score: 96 },
  { term: 'भोसड़ीके', category: 'Harassment', language: 'Hindi', score: 95 },
  { term: 'कमीने', category: 'Personal attacks', language: 'Hindi', score: 86 },

  // --- Hindi Transliterated (Hinglish) ---
  { term: 'chutiya', category: 'Harassment', language: 'Hindi (Hinglish)', score: 90 },
  { term: 'chutiye', category: 'Harassment', language: 'Hindi (Hinglish)', score: 90 },
  { term: 'madarchod', category: 'Sexual harassment', language: 'Hindi (Hinglish)', score: 98 },
  { term: 'bhenchod', category: 'Sexual harassment', language: 'Hindi (Hinglish)', score: 97 },
  { term: 'behenchod', category: 'Sexual harassment', language: 'Hindi (Hinglish)', score: 97 },
  { term: 'bhosdike', category: 'Harassment', language: 'Hindi (Hinglish)', score: 95 },
  { term: 'randi', category: 'Sexual harassment', language: 'Hindi (Hinglish)', score: 96 },
  { term: 'harami', category: 'Personal attacks', language: 'Hindi (Hinglish)', score: 85 },
  { term: 'gandu', category: 'Obscene language', language: 'Hindi (Hinglish)', score: 90 },
  { term: 'kutta', category: 'Personal attacks', language: 'Hindi (Hinglish)', score: 80 },

  // --- Urdu Native Script ---
  { term: 'کتے کے بچے', category: 'Personal attacks', language: 'Urdu', score: 92 },
  { term: 'حرام خور', category: 'Personal attacks', language: 'Urdu', score: 90 },
  { term: 'بے غیرت', category: 'Personal attacks', language: 'Urdu', score: 88 },
  { term: 'ذلیل', category: 'Bullying', language: 'Urdu', score: 85 },
  { term: 'خبیث', category: 'Personal attacks', language: 'Urdu', score: 88 },

  // --- Urdu Transliterated (Roman Urdu) ---
  { term: 'kuttay ke bachay', category: 'Personal attacks', language: 'Urdu (Roman Urdu)', score: 92 },
  { term: 'haramkhor', category: 'Personal attacks', language: 'Urdu (Roman Urdu)', score: 90 },
  { term: 'beghairat', category: 'Personal attacks', language: 'Urdu (Roman Urdu)', score: 88 },
  { term: 'kameena', category: 'Personal attacks', language: 'Urdu (Roman Urdu)', score: 86 },
  { term: 'zaleel insaan', category: 'Bullying', language: 'Urdu (Roman Urdu)', score: 88 },
  { term: 'laanat ho tum par', category: 'Harassment', language: 'Urdu (Roman Urdu)', score: 86 },

  // --- Tamil Native Script ---
  { term: 'தேவிடியா பையன்', category: 'Sexual harassment', language: 'Tamil', score: 96 },
  { term: 'புண்ட', category: 'Sexual harassment', language: 'Tamil', score: 96 },
  { term: 'நாயே', category: 'Personal attacks', language: 'Tamil', score: 88 },
  { term: 'ஒழுங்கா போடா', category: 'Harassment', language: 'Tamil', score: 80 },

  // --- Tamil Transliterated (Tanglish) ---
  { term: 'thevidiya', category: 'Sexual harassment', language: 'Tamil (Tanglish)', score: 96 },
  { term: 'punda', category: 'Sexual harassment', language: 'Tamil (Tanglish)', score: 95 },
  { term: 'pundamavane', category: 'Sexual harassment', language: 'Tamil (Tanglish)', score: 97 },
  { term: 'otha', category: 'Obscene language', language: 'Tamil (Tanglish)', score: 92 },
  { term: 'omala', category: 'Obscene language', language: 'Tamil (Tanglish)', score: 92 },
  { term: 'naaye', category: 'Personal attacks', language: 'Tamil (Tanglish)', score: 88 },
  { term: 'loosu payale', category: 'Bullying', language: 'Tamil (Tanglish)', score: 85 },
];

/**
 * Runs secondary safety checks against normalized and compact text
 */
export function evaluateSecondarySafety(
  rawText: string,
  normalizedText?: string,
  compactText?: string
): SecondarySafetyHit {
  const norm = normalizedText !== undefined ? normalizedText : (rawText || '').toLowerCase().replace(/[\s\-_.]+/g, ' ').trim();
  const compact = compactText !== undefined ? compactText : (rawText || '').toLowerCase().replace(/[\s\-_.]+/g, '').trim();
  const lower = (rawText || '').toLowerCase();

  // 1. Phishing & Link Abuse Detection
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(rawText) || pattern.test(norm)) {
      return {
        matched: true,
        category: 'Phishing/link abuse',
        language: 'English',
        toxicityScore: 92,
        reason: 'Detected potential phishing, scam, or unauthorized link abuse.',
        ruleId: 'SEC_RULE_PHISHING',
      };
    }
  }

  // 2. Spam Detection
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(rawText) || pattern.test(norm)) {
      return {
        matched: true,
        category: 'Spam',
        language: 'English',
        toxicityScore: 80,
        reason: 'Detected unsolicited spam, mass promotion, or engagement manipulation.',
        ruleId: 'SEC_RULE_SPAM',
      };
    }
  }

  // 3. Direct Threat Detection
  for (const pattern of THREAT_PATTERNS) {
    if (pattern.test(rawText) || pattern.test(norm) || pattern.test(compact)) {
      return {
        matched: true,
        category: 'Threats',
        language: 'Multilingual',
        toxicityScore: 98,
        reason: 'Violates zero-tolerance policy against violent threats and harm.',
        ruleId: 'SEC_RULE_THREAT',
      };
    }
  }

  // 4. Zero-Tolerance Multilingual Slurs & Severe Abuse
  for (const rule of SECONDARY_KEYWORD_RULES) {
    const term = rule.term.toLowerCase();
    const tCompact = term.replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F\u0C00-\u0C7F\u0B80-\u0BFF]/g, '');

    const isAscii = /^[a-z0-9\s]+$/i.test(term);
    const regex = isAscii
      ? new RegExp(`(^|\\W)${term}($|\\W)`, 'i')
      : new RegExp(`(^|[^\\p{L}\\p{N}])${term}($|[^\\p{L}\\p{N}])`, 'iu');

    if (regex.test(lower) || regex.test(norm)) {
      return {
        matched: true,
        category: rule.category,
        language: rule.language,
        toxicityScore: rule.score,
        reason: `Violates community safety rules. Detected ${rule.category.toLowerCase()} (${rule.language}).`,
        ruleId: `SEC_RULE_${rule.category.toUpperCase().replace(/\s+/g, '_')}`,
      };
    }

    // Check for spaced-out letter obfuscation (e.g. "o t h a", "f u c k", "l a n j a")
    if (term.length >= 3 && isAscii && !term.includes(' ')) {
      const spacedLetters = term.split('').join('\\s+');
      const spacedRegex = new RegExp(`(^|\\W)${spacedLetters}($|\\W)`, 'i');
      if (spacedRegex.test(rawText) || spacedRegex.test(norm)) {
        return {
          matched: true,
          category: rule.category,
          language: rule.language,
          toxicityScore: rule.score,
          reason: `Violates community safety rules. Detected spaced obfuscated ${rule.category.toLowerCase()} (${rule.language}).`,
          ruleId: `SEC_RULE_SPACED_${rule.category.toUpperCase().replace(/\s+/g, '_')}`,
        };
      }
    }

    // For longer terms (6+ characters) where cross-word collisions are practically impossible, check compact
    if (tCompact.length >= 6 && compact.includes(tCompact)) {
      return {
        matched: true,
        category: rule.category,
        language: rule.language,
        toxicityScore: rule.score,
        reason: `Violates community safety rules. Detected obfuscated ${rule.category.toLowerCase()} (${rule.language}).`,
        ruleId: `SEC_RULE_OBFUSCATED_${rule.category.toUpperCase().replace(/\s+/g, '_')}`,
      };
    }
  }

  return { matched: false };
}
