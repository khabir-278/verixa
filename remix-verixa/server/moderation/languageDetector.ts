export interface LanguageDetectionResult {
  primaryLanguage: string;
  languageDetected: string;
  isTransliterated: boolean;
  isMixed: boolean;
  script: string;
  detectedLanguages: string[];
  confidence: number;
}

// Unicode script regex ranges
const SCRIPT_RANGES = {
  telugu: /[\u0C00-\u0C7F]/,
  hindi: /[\u0900-\u097F]/, // Devanagari
  urdu: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/, // Arabic / Perso-Arabic / Urdu
  tamil: /[\u0B80-\u0BFF]/,
  latin: /[A-Za-z]/,
};

// Common lexical markers for transliterated Indic / South Asian languages
const TRANSLITERATED_LEXICONS: Record<string, string[]> = {
  telugu: [
    'nuvvu', 'nenu', 'enti', 'cheppu', 'kuda', 'undi', 'chesavu', 'chudu', 'babu', 'ra', 'andi',
    'ekkada', 'enduku', 'vaddu', 'leka', 'mana', 'meeru', 'thopu', 'keka', 'lanja', 'dengu', 'dengutha',
    'modda', 'puku', 'vedhava', 'chetha', 'kodaka', 'picchi', 'koduku', 'pukoda', 'emiti', 'chey',
    'bagundi', 'chala', 'ippudu', 'evaru', 'ledu', 'kavale', 'guduv', 'chav', 'amma', 'ayya',
  ],
  hindi: [
    'hai', 'hain', 'kya', 'nahi', 'tum', 'mera', 'meri', 'bhai', 'karo', 'hota', 'hoti', 'raha',
    'sunte', 'dekh', 'kar', 'bhi', 'toh', 'bohot', 'achha', 'chutiya', 'chutiye', 'madarchod', 'bhenchod',
    'behenchod', 'harami', 'kutta', 'kutte', 'saale', 'kaminey', 'bhosdike', 'gandu', 'randi', 'lund',
    'lauda', 'gand', 'bakwas', 'marja', 'pagal', 'dost', 'yaar', 'aap', 'hum', 'kyun', 'kuch',
  ],
  urdu: [
    'aap', 'hum', 'kyun', 'karein', 'hoga', 'hogi', 'shukriya', 'zaroor', 'khuda', 'janaab', 'kuttay',
    'bachay', 'haramkhor', 'bakwas', 'gandi', 'laanat', 'kameena', 'kameenay', 'mar ja', 'chup kar',
    'zaleel', 'beghairat', 'khabees', 'jahil', 'fazool', 'koshish', 'tamasha', 'sharam', 'toba',
    'mashallah', 'inshallah', 'khuda hafiz', 'bhai jaan', 'muhabat',
  ],
  tamil: [
    'nee', 'naan', 'enna', 'solla', 'irukku', 'irukanga', 'panreenga', 'da', 'pa', 'ungalukku',
    'romba', 'nalla', 'vanakkam', 'vaazhthukkal', 'thevidiya', 'punda', 'otha', 'omala', 'naaye',
    'kena', 'loosu', 'seththu', 'mooditu', 'thambi', 'machan', 'seri', 'eppadi', 'inga', 'anga',
    'koothi', 'sunni', 'vetti', 'padam', 'kaasu', 'paravalla',
  ],
};

/**
 * Intelligent Multilingual Language Detector
 * Accurately classifies English, Telugu, Hindi, Urdu, Tamil across native scripts,
 * transliterated phonetics, and mixed-language code switching.
 */
export function detectLanguage(text: string, normalizedText?: string): LanguageDetectionResult {
  if (!text || !text.trim()) {
    return {
      primaryLanguage: 'English',
      languageDetected: 'English',
      isTransliterated: false,
      isMixed: false,
      script: 'None',
      detectedLanguages: ['English'],
      confidence: 100,
    };
  }

  const clean = normalizedText || text.toLowerCase();

  // 1. Check Native Script character distributions
  let teluguCharCount = 0;
  let hindiCharCount = 0;
  let urduCharCount = 0;
  let tamilCharCount = 0;
  let latinCharCount = 0;

  for (const char of text) {
    if (SCRIPT_RANGES.telugu.test(char)) teluguCharCount++;
    else if (SCRIPT_RANGES.hindi.test(char)) hindiCharCount++;
    else if (SCRIPT_RANGES.urdu.test(char)) urduCharCount++;
    else if (SCRIPT_RANGES.tamil.test(char)) tamilCharCount++;
    else if (SCRIPT_RANGES.latin.test(char)) latinCharCount++;
  }

  const totalChars = teluguCharCount + hindiCharCount + urduCharCount + tamilCharCount + latinCharCount || 1;

  // Native script dominant checks
  if (teluguCharCount > 2) {
    if (latinCharCount > 3) {
      return {
        primaryLanguage: 'Telugu',
        languageDetected: 'Mixed (Telugu + English)',
        isTransliterated: false,
        isMixed: true,
        script: 'Telugu + Latin',
        detectedLanguages: ['Telugu', 'English'],
        confidence: 96,
      };
    }
    return {
      primaryLanguage: 'Telugu',
      languageDetected: 'Telugu',
      isTransliterated: false,
      isMixed: false,
      script: 'Telugu Native',
      detectedLanguages: ['Telugu'],
      confidence: 99,
    };
  }

  if (hindiCharCount > 2) {
    if (latinCharCount > 3) {
      return {
        primaryLanguage: 'Hindi',
        languageDetected: 'Mixed (Hindi + English)',
        isTransliterated: false,
        isMixed: true,
        script: 'Devanagari + Latin',
        detectedLanguages: ['Hindi', 'English'],
        confidence: 96,
      };
    }
    return {
      primaryLanguage: 'Hindi',
      languageDetected: 'Hindi',
      isTransliterated: false,
      isMixed: false,
      script: 'Devanagari Native',
      detectedLanguages: ['Hindi'],
      confidence: 99,
    };
  }

  if (urduCharCount > 2) {
    if (latinCharCount > 3) {
      return {
        primaryLanguage: 'Urdu',
        languageDetected: 'Mixed (Urdu + English)',
        isTransliterated: false,
        isMixed: true,
        script: 'Urdu + Latin',
        detectedLanguages: ['Urdu', 'English'],
        confidence: 96,
      };
    }
    return {
      primaryLanguage: 'Urdu',
      languageDetected: 'Urdu',
      isTransliterated: false,
      isMixed: false,
      script: 'Urdu Native',
      detectedLanguages: ['Urdu'],
      confidence: 99,
    };
  }

  if (tamilCharCount > 2) {
    if (latinCharCount > 3) {
      return {
        primaryLanguage: 'Tamil',
        languageDetected: 'Mixed (Tamil + English)',
        isTransliterated: false,
        isMixed: true,
        script: 'Tamil + Latin',
        detectedLanguages: ['Tamil', 'English'],
        confidence: 96,
      };
    }
    return {
      primaryLanguage: 'Tamil',
      languageDetected: 'Tamil',
      isTransliterated: false,
      isMixed: false,
      script: 'Tamil Native',
      detectedLanguages: ['Tamil'],
      confidence: 99,
    };
  }

  // 2. Transliteration / Romanized Latin Analysis
  // Tokenize text into words
  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const scores: Record<string, number> = {
    telugu: 0,
    hindi: 0,
    urdu: 0,
    tamil: 0,
    english: 0,
  };

  const englishCommonWords = new Set([
    'the', 'is', 'are', 'you', 'this', 'that', 'for', 'with', 'and', 'not', 'have', 'from',
    'your', 'all', 'what', 'can', 'out', 'about', 'get', 'like', 'just', 'work', 'good',
    'great', 'bad', 'hate', 'kill', 'die', 'fuck', 'shit', 'bitch', 'idiot', 'moron', 'please',
    'dude', 'bro', 'stop', 'post', 'comment', 'video', 'friend', 'awesome', 'amazing', 'tutorial',
  ]);

  const urduDistinctiveWords = new Set([
    'shukriya', 'janaab', 'janab', 'insaan', 'zaroor', 'khuda', 'beghairat', 'zaleel', 'khabees',
    'laanat', 'toba', 'mashallah', 'inshallah', 'hafiz', 'bachay', 'kuttay', 'kameena', 'kameenay',
    'tamasha', 'sharam', 'muhabat', 'muhabbat', 'fazool', 'zindagi', 'adab', 'wafa',
  ]);

  const hindiDistinctiveWords = new Set([
    'chutiya', 'chutiye', 'madarchod', 'bhenchod', 'behenchod', 'gandu', 'bhosdike', 'lund', 'lauda',
    'namaste', 'dhanyawad', 'pranam', 'mitra', 'samajh', 'desh', 'dharma',
  ]);

  for (const word of words) {
    if (englishCommonWords.has(word)) {
      scores.english += 1.5;
    }
    if (urduDistinctiveWords.has(word)) {
      scores.urdu += 3.0;
    }
    if (hindiDistinctiveWords.has(word)) {
      scores.hindi += 3.0;
    }

    for (const [lang, vocab] of Object.entries(TRANSLITERATED_LEXICONS)) {
      if (vocab.includes(word)) {
        scores[lang] += 2.0;
      } else {
        // Substring / suffix matches
        for (const v of vocab) {
          if (v.length >= 4 && (word.startsWith(v) || word.endsWith(v))) {
            scores[lang] += 1.2;
            break;
          }
        }
      }
    }
  }

  // Determine top transliterated language if score threshold is reached
  const indicLangs = ['telugu', 'hindi', 'urdu', 'tamil'];
  let topIndicLang = '';
  let highestIndicScore = 0;

  for (const lang of indicLangs) {
    if (scores[lang] > highestIndicScore) {
      highestIndicScore = scores[lang];
      topIndicLang = lang;
    }
  }

  // Check if mixed with English
  const hasStrongEnglish = scores.english >= 1.5 || words.length > 5;

  if (highestIndicScore >= 2.0) {
    const capitalizedIndic = topIndicLang.charAt(0).toUpperCase() + topIndicLang.slice(1);
    const transliteratedLabel =
      topIndicLang === 'telugu'
        ? 'Telugu (Tenglish)'
        : topIndicLang === 'hindi'
        ? 'Hindi (Hinglish)'
        : topIndicLang === 'urdu'
        ? 'Urdu (Roman Urdu)'
        : 'Tamil (Tanglish)';

    if (hasStrongEnglish && scores.english >= 2.0) {
      return {
        primaryLanguage: capitalizedIndic,
        languageDetected: `Mixed (${capitalizedIndic} + English)`,
        isTransliterated: true,
        isMixed: true,
        script: 'Latin (Transliterated)',
        detectedLanguages: [capitalizedIndic, 'English'],
        confidence: 92,
      };
    }

    return {
      primaryLanguage: capitalizedIndic,
      languageDetected: transliteratedLabel,
      isTransliterated: true,
      isMixed: false,
      script: 'Latin (Transliterated)',
      detectedLanguages: [capitalizedIndic],
      confidence: 94,
    };
  }

  // Default to English
  return {
    primaryLanguage: 'English',
    languageDetected: 'English',
    isTransliterated: false,
    isMixed: false,
    script: 'Latin',
    detectedLanguages: ['English'],
    confidence: 95,
  };
}
