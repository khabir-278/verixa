/**
 * Client-Side Privacy Scanner
 *
 * Provides real-time, client-side PII detection and redaction for CreatePostModal,
 * comment inputs, and profile bio edits to protect users before publication.
 */

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

export function luhnCheck(numStr: string): boolean {
  const sanitized = numStr.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(sanitized)) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function scanPrivacyInText(text: string): PrivacyScanResult {
  if (!text || typeof text !== 'string') {
    return {
      has_sensitive_data: false,
      detections: [],
      warning_message: null,
      redacted_text: '',
      detected_types: [],
    };
  }

  const detections: PIIDetection[] = [];

  // 1. Credit Cards
  const cardRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,16}\b/g;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardRegex.exec(text)) !== null) {
    const raw = cardMatch[0];
    const digitsOnly = raw.replace(/[\s-]/g, '');
    if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && luhnCheck(digitsOnly)) {
      detections.push({
        type: 'credit_card',
        raw_match: raw,
        masked_value: `XXXX-XXXX-XXXX-${digitsOnly.slice(-4)}`,
        start_index: cardMatch.index,
        end_index: cardMatch.index + raw.length,
        description: 'Payment card number detected with valid checksum',
      });
    }
  }

  // 2. Bank Account & Financial Routing
  const ibanRegex = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
  let ibanMatch: RegExpExecArray | null;
  while ((ibanMatch = ibanRegex.exec(text)) !== null) {
    const raw = ibanMatch[0];
    detections.push({
      type: 'bank_account',
      raw_match: raw,
      masked_value: `${raw.slice(0, 4)}****${raw.slice(-4)}`,
      start_index: ibanMatch.index,
      end_index: ibanMatch.index + raw.length,
      description: 'International Bank Account Number (IBAN)',
    });
  }

  const ifscRegex = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
  let ifscMatch: RegExpExecArray | null;
  while ((ifscMatch = ifscRegex.exec(text)) !== null) {
    const raw = ifscMatch[0];
    detections.push({
      type: 'bank_account',
      raw_match: raw,
      masked_value: `${raw.slice(0, 4)}0******`,
      start_index: ifscMatch.index,
      end_index: ifscMatch.index + raw.length,
      description: 'Indian Financial System Code (IFSC)',
    });
  }

  const bankKeywordsRegex = /(?:a\/c|account|acct|bank|routing|ifsc)[\s#:.-]*(\d{9,18})\b/gi;
  let bankMatch: RegExpExecArray | null;
  while ((bankMatch = bankKeywordsRegex.exec(text)) !== null) {
    const raw = bankMatch[1];
    const matchStart = bankMatch.index + bankMatch[0].indexOf(raw);
    const alreadyMatched = detections.some(
      (d) => matchStart >= d.start_index && matchStart < d.end_index
    );
    if (!alreadyMatched) {
      detections.push({
        type: 'bank_account',
        raw_match: raw,
        masked_value: `****${raw.slice(-4)}`,
        start_index: matchStart,
        end_index: matchStart + raw.length,
        description: 'Bank account number sequence with financial context keyword',
      });
    }
  }

  // 3. Aadhaar Numbers (12-digits, Indian UIDAI)
  const aadhaarRegex = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  let aadhaarMatch: RegExpExecArray | null;
  while ((aadhaarMatch = aadhaarRegex.exec(text)) !== null) {
    const raw = aadhaarMatch[0];
    const alreadyMatched = detections.some(
      (d) => aadhaarMatch!.index >= d.start_index && aadhaarMatch!.index < d.end_index
    );
    const prefixText = text.substring(Math.max(0, aadhaarMatch.index - 20), aadhaarMatch.index);
    const isBankContext = /(?:a\/c|account|acct|bank|routing|ifsc)[\s#:.-]*$/i.test(prefixText);

    if (!alreadyMatched && !isBankContext) {
      const digits = raw.replace(/[\s-]/g, '');
      detections.push({
        type: 'aadhaar_number',
        raw_match: raw,
        masked_value: `XXXX-XXXX-${digits.slice(-4)}`,
        start_index: aadhaarMatch.index,
        end_index: aadhaarMatch.index + raw.length,
        description: '12-digit Aadhaar / National Identity number pattern',
      });
    }
  }

  // SSN Pattern
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  let ssnMatch: RegExpExecArray | null;
  while ((ssnMatch = ssnRegex.exec(text)) !== null) {
    const raw = ssnMatch[0];
    detections.push({
      type: 'aadhaar_number',
      raw_match: raw,
      masked_value: `XXX-XX-${raw.slice(-4)}`,
      start_index: ssnMatch.index,
      end_index: ssnMatch.index + raw.length,
      description: 'National identity / SSN identifier detected',
    });
  }

  // 4. Phone Numbers
  const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|(?:\+91[\s-]?)?[6-9]\d{9}\b/g;
  let phoneMatch: RegExpExecArray | null;
  while ((phoneMatch = phoneRegex.exec(text)) !== null) {
    const raw = phoneMatch[0];
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 13) {
      const alreadyMatched = detections.some(
        (d) => phoneMatch!.index >= d.start_index && phoneMatch!.index < d.end_index
      );
      if (!alreadyMatched) {
        detections.push({
          type: 'phone_number',
          raw_match: raw,
          masked_value: `${digitsOnly.slice(0, 3)}****${digitsOnly.slice(-3)}`,
          start_index: phoneMatch.index,
          end_index: phoneMatch.index + raw.length,
          description: 'Direct phone / mobile contact number',
        });
      }
    }
  }

  // 5. Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = emailRegex.exec(text)) !== null) {
    const raw = emailMatch[0];
    const [name, domain] = raw.split('@');
    const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
    detections.push({
      type: 'email_address',
      raw_match: raw,
      masked_value: `${maskedName}@${domain}`,
      start_index: emailMatch.index,
      end_index: emailMatch.index + raw.length,
      description: 'Personal or direct email address',
    });
  }

  detections.sort((a, b) => a.start_index - b.start_index);

  let redacted = text;
  for (let i = detections.length - 1; i >= 0; i--) {
    const d = detections[i];
    redacted =
      redacted.substring(0, d.start_index) +
      `[${d.masked_value}]` +
      redacted.substring(d.end_index);
  }

  const detectedTypes = Array.from(new Set(detections.map((d) => d.type)));
  const hasSensitiveData = detections.length > 0;

  let warningMessage: string | null = null;
  if (hasSensitiveData) {
    const typeLabels = detectedTypes.map((t) => t.replace('_', ' ')).join(', ');
    warningMessage = `Privacy Alert: We detected sensitive personal data (${typeLabels}). Posting PII publicly risks your security.`;
  }

  return {
    has_sensitive_data: hasSensitiveData,
    detections,
    warning_message: warningMessage,
    redacted_text: redacted,
    detected_types: detectedTypes,
  };
}

export function scanForSensitiveData(text: string) {
  const res = scanPrivacyInText(text);
  return {
    hasSensitiveData: res.has_sensitive_data,
    detectedTypes: res.detected_types,
    warningMessage: res.warning_message,
    redactedText: res.redacted_text,
    detections: res.detections,
  };
}

export function redactSensitiveData(text: string): string {
  return scanPrivacyInText(text).redacted_text;
}
