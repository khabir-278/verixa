import * as crypto from 'crypto';
import { ContentType } from './types';

export interface NormalizedInput {
  contentType: ContentType;
  rawContent: string;
  normalizedText: string;
  compactText: string;
  hasOffensiveEmoji: boolean;
  contentHash: string;
  isMedia: boolean;
  sanitizedForPrompt: string;
  pipelineStages?: {
    unicodeNormalized: string;
    zeroWidthRemoved: string;
    homoglyphsNormalized: string;
    leetspeakNormalized: string;
    repeatedCharsNormalized: string;
  };
}

const SUPPORTED_CONTENT_TYPES: ContentType[] = [
  'comment',
  'caption',
  'post_text',
  'image',
  'video',
  'gif',
  'story',
  'reel',
  'profile_picture',
  'cover_photo',
  'dm_text',
  'dm_media',
];

/**
 * Detects and maps input identifiers to a canonical ContentType
 */
export function detectContentType(typeInput?: string, mimeType?: string, contentStr: string = ''): ContentType {
  const lower = (typeInput || '').toLowerCase().trim();

  if (lower === 'comment' || lower === 'comments') return 'comment';
  if (lower === 'caption' || lower === 'captions') return 'caption';
  if (lower === 'post_text' || lower === 'post' || lower === 'post text' || lower === 'text') return 'post_text';
  if (lower === 'image' || lower === 'images' || lower === 'photo') return 'image';
  if (lower === 'video' || lower === 'videos') return 'video';
  if (lower === 'gif' || lower === 'gifs') return 'gif';
  if (lower === 'story' || lower === 'stories') return 'story';
  if (lower === 'reel' || lower === 'reels' || lower === 'short') return 'reel';
  if (lower === 'profile_picture' || lower === 'avatar' || lower === 'pfp' || lower === 'profile picture') return 'profile_picture';
  if (lower === 'cover_photo' || lower === 'cover' || lower === 'banner' || lower === 'cover photo') return 'cover_photo';
  if (lower === 'dm_text' || lower === 'message' || lower === 'direct_message' || lower === 'chat' || lower === 'direct-message text') return 'dm_text';
  if (lower === 'dm_media' || lower === 'chat_media' || lower === 'message media') return 'dm_media';

  // Fallback detection from mimeType or content headers
  if (mimeType) {
    const mime = mimeType.toLowerCase();
    if (mime.includes('gif')) return 'gif';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
  }

  // Fallback detection from data URL or remote URL extension
  if (contentStr.startsWith('data:image/gif') || /\.gif(\?|$)/i.test(contentStr)) return 'gif';
  if (contentStr.startsWith('data:image/') || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(contentStr)) return 'image';
  if (contentStr.startsWith('data:video/') || /\.(mp4|webm|mov|mkv)(\?|$)/i.test(contentStr)) return 'video';

  // Default to comment if text
  return 'comment';
}

/**
 * Validates request payload sizes to prevent Denial-of-Service
 */
export function validatePayloadSize(content: string, contentType: ContentType): { valid: boolean; error?: string } {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Payload content must be a string.' };
  }

  const isMedia = ['image', 'video', 'gif', 'story', 'reel', 'profile_picture', 'cover_photo', 'dm_media'].includes(contentType);

  if (!isMedia) {
    // Text payloads: 50 KB limit
    const byteSize = Buffer.byteLength(content, 'utf8');
    if (byteSize > 50 * 1024) {
      return { valid: false, error: 'Text payload exceeds maximum allowed size of 50KB.' };
    }
  } else {
    // Media payloads: 15 MB limit (in base64 or URL)
    const byteSize = Buffer.byteLength(content, 'utf8');
    if (byteSize > 15 * 1024 * 1024) {
      return { valid: false, error: 'Media payload exceeds maximum allowed size of 15MB.' };
    }
  }

  return { valid: true };
}

/**
 * Step 1: Unicode Normalization (NFKC)
 * Decomposes and recomposes according to compatibility equivalents, resolving full-width and ligature variations.
 */
export function normalizeUnicode(text: string): string {
  if (!text) return '';
  return text.normalize('NFKC');
}

/**
 * Step 2: Zero-width character & invisible control code removal
 * Strips zero-width spaces, BOM, joiners, soft hyphens, and invisible separators used for evasion.
 */
export function removeZeroWidthChars(text: string): string {
  if (!text) return '';
  return text.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E\u2063\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, '');
}

/**
 * Step 3: Homoglyph Normalization
 * Maps look-alike Cyrillic, Greek, full-width, mathematical, and accented Latin homoglyphs to canonical Latin equivalents.
 */
export function normalizeHomoglyphs(text: string): string {
  if (!text) return '';
  const homoglyphs: Record<string, string> = {
    // Cyrillic lookalikes
    а: 'a', А: 'A', в: 'b', В: 'B', е: 'e', Е: 'E', о: 'o', О: 'O',
    р: 'p', Р: 'P', с: 'c', С: 'C', т: 't', Т: 'T', у: 'y', У: 'Y',
    х: 'x', Х: 'X', і: 'i', І: 'I', ј: 'j', Ј: 'J', ѕ: 's', Ѕ: 'S',
    // Greek lookalikes
    α: 'a', β: 'b', γ: 'y', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v',
    ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
    // Accented Latin characters
    à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
    è: 'e', é: 'e', ê: 'e', ë: 'e',
    ì: 'i', í: 'i', î: 'i', ï: 'i',
    ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
    ù: 'u', ú: 'u', û: 'u', ü: 'u',
    ñ: 'n', ç: 'c', ÿ: 'y',
  };
  return text.split('').map((char) => homoglyphs[char] || char).join('');
}

/**
 * Step 4: Leetspeak Normalization
 * Maps obfuscating numbers and symbols (@, $, 0, 1, !, 3, 4, 5, 7, 8) to their alphabet equivalents.
 */
export function normalizeLeetspeak(text: string): string {
  if (!text) return '';
  return text
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/\|/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g')
    .replace(/\+/g, 't');
}

/**
 * Step 5: Repeated-character Normalization
 * Collapses elongated character strings (e.g. "fuuuuck" -> "fuck", "denguuu" -> "dengu")
 */
export function normalizeRepeatedChars(text: string): string {
  if (!text) return '';
  return text.replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * Normalizes text across all pipeline stages to uncover evasion, unicode homoglyphs, and leetspeak obfuscation
 */
export function normalizeText(text: string): {
  normalized: string;
  compact: string;
  hasOffensiveEmoji: boolean;
  stages: {
    unicodeNormalized: string;
    zeroWidthRemoved: string;
    homoglyphsNormalized: string;
    leetspeakNormalized: string;
    repeatedCharsNormalized: string;
  };
} {
  if (!text) {
    return {
      normalized: '',
      compact: '',
      hasOffensiveEmoji: false,
      stages: {
        unicodeNormalized: '',
        zeroWidthRemoved: '',
        homoglyphsNormalized: '',
        leetspeakNormalized: '',
        repeatedCharsNormalized: '',
      },
    };
  }

  // Pipeline Step 1: Unicode Normalization
  const unicodeNormalized = normalizeUnicode(text);

  // Pipeline Step 2: Zero-width character removal
  const zeroWidthRemoved = removeZeroWidthChars(unicodeNormalized);

  // Check for offensive emojis & threat combinations
  const hasOffensiveEmoji =
    /🖕|(\u{1F595})/u.test(zeroWidthRemoved) ||
    (/(🗡️|🔪|🔫).*(🩸|💀|☠️)/u.test(zeroWidthRemoved) && /(die|kill|u|you)/i.test(zeroWidthRemoved));

  // Pipeline Step 3: Homoglyph normalization
  const homoglyphsNormalized = normalizeHomoglyphs(zeroWidthRemoved);

  // Pipeline Step 4: Leetspeak normalization
  const leetspeakNormalized = normalizeLeetspeak(homoglyphsNormalized);

  // Pipeline Step 5: Repeated-character normalization
  const repeatedCharsNormalized = normalizeRepeatedChars(leetspeakNormalized);

  // Compact version with all spaces & punctuation stripped (e.g. "f u c k" -> "fuck", "c.h.u.t.i.y.a" -> "chutiya")
  const compact = zeroWidthRemoved
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F\u0C00-\u0C7F\u0B80-\u0BFF\u0C80-\u0CFF\u0D00-\u0D7F\u0980-\u09FF]/g, '');

  return {
    normalized: repeatedCharsNormalized.toLowerCase(),
    compact,
    hasOffensiveEmoji,
    stages: {
      unicodeNormalized,
      zeroWidthRemoved,
      homoglyphsNormalized,
      leetspeakNormalized,
      repeatedCharsNormalized,
    },
  };
}

/**
 * Prevents prompt injection by stripping common jailbreak patterns and wrapping untrusted content in strict delimiters
 */
export function sanitizeAgainstPromptInjection(rawText: string): string {
  if (!rawText) return '';

  // Neutralize common instruction-breaking tokens
  let sanitized = rawText
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[ATTEMPTED_INJECTION_STRIPPED]')
    .replace(/system\s+override/gi, '[ATTEMPTED_OVERRIDE_STRIPPED]')
    .replace(/you\s+are\s+now\s+in\s+developer\s+mode/gi, '[ATTEMPTED_DEV_MODE_STRIPPED]')
    .replace(/DAN\s+mode/gi, '[ATTEMPTED_DAN_STRIPPED]');

  // Fencing with unambiguous boundary tokens
  return `<<<UNTRUSTED_CONTENT_BEGIN>>>\n${sanitized}\n<<<UNTRUSTED_CONTENT_END>>>`;
}

/**
 * Creates a sanitized snippet that redacts sensitive text to avoid storing unnecessary raw toxic content
 */
export function createRedactedSnippet(text: string, isOffensive: boolean): string {
  if (!text) return '';
  if (text.startsWith('data:') || text.startsWith('http')) {
    // Media URL or base64
    const typeLabel = text.startsWith('data:') ? 'base64_media' : 'media_url';
    return `[${typeLabel} ${text.slice(0, 30)}...]`;
  }

  if (isOffensive) {
    // If offensive, avoid storing raw slurs or harassment in plain audit logs
    const length = text.length;
    return `[REDACTED_SENSITIVE_CONTENT: ${length} chars]`;
  }

  // If safe, keep short snippet (max 50 chars)
  const trimmed = text.trim();
  return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
}

/**
 * Main Normalization pipeline step
 */
export function processNormalization(
  content: string,
  rawType?: string,
  mimeType?: string
): NormalizedInput {
  const contentType = detectContentType(rawType, mimeType, content);
  const isMedia = ['image', 'video', 'gif', 'story', 'reel', 'profile_picture', 'cover_photo', 'dm_media'].includes(contentType);

  const contentHash = crypto.createHash('sha256').update(content || '').digest('hex');

  let normalizedText = '';
  let compactText = '';
  let hasOffensiveEmoji = false;
  let pipelineStages: any = undefined;

  if (!isMedia) {
    const norm = normalizeText(content);
    normalizedText = norm.normalized;
    compactText = norm.compact;
    hasOffensiveEmoji = norm.hasOffensiveEmoji;
    pipelineStages = norm.stages;
  }

  const sanitizedForPrompt = !isMedia ? sanitizeAgainstPromptInjection(content) : '';

  return {
    contentType,
    rawContent: content,
    normalizedText,
    compactText,
    hasOffensiveEmoji,
    contentHash,
    isMedia,
    sanitizedForPrompt,
    pipelineStages,
  };
}
