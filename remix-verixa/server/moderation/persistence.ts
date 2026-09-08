import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ModerationEventRecord, NormalizedModerationResponse, ContentType } from './types';
import { createRedactedSnippet } from './normalizer';

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'moderation_events.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory for moderation events:', err);
  }
}

// Memory buffer of recent events for instant retrieval (keeps last 500 records)
const memoryEventBuffer: ModerationEventRecord[] = [];

// Load existing events from file on boot
try {
  if (fs.existsSync(EVENTS_FILE)) {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryEventBuffer.push(...parsed.slice(-500));
    }
  }
} catch (err) {
  console.warn('Notice loading existing moderation events file:', err);
}

// Server Supabase Client initialization
function getServerSupabase(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

/**
 * Persists a moderation event record across durable server storage and remote Supabase
 */
export async function persistModerationEvent(
  response: NormalizedModerationResponse,
  rawContent: string,
  contentHash: string,
  metadata?: {
    userId?: string;
    username?: string;
    targetId?: string;
    contentId?: string;
  }
): Promise<ModerationEventRecord> {
  const isOffensive = !response.allowed || response.decision === 'BLOCK';
  const snippetRedacted = createRedactedSnippet(rawContent, isOffensive);
  const now = new Date().toISOString();
  const contentId = metadata?.contentId || metadata?.targetId || response.analysis_id;

  const eventRecord: ModerationEventRecord = {
    analysis_id: response.analysis_id,
    content_id: contentId,
    content_type: response.content_type,
    model: response.model,
    model_version: response.model_version,
    scores: response.scores || {
      toxicity: response.toxicity_score,
      risk: response.risk_score,
    },
    labels: response.labels || response.categories,
    decision: response.decision,
    state: response.state || (response.allowed ? 'APPROVED' : response.decision === 'BLOCK' ? 'REJECTED' : 'REVIEW_REQUIRED'),
    timestamps: {
      created_at: now,
      analyzed_at: now,
    },
    allowed: response.allowed,
    status: response.status,
    confidence: response.confidence,
    reason: response.reason,
    content_hash: contentHash,
    content_length: rawContent ? rawContent.length : 0,
    snippet_redacted: snippetRedacted,
    language: response.language,
    evidence_references: response.evidence_references,
    user_id: metadata?.userId,
    username: metadata?.username,
    target_id: metadata?.targetId,
    created_at: now,
  };

  // 1. Persist to memory buffer & local durable file
  try {
    memoryEventBuffer.unshift(eventRecord);
    if (memoryEventBuffer.length > 500) {
      memoryEventBuffer.pop();
    }

    fs.writeFileSync(EVENTS_FILE, JSON.stringify(memoryEventBuffer.slice(0, 500), null, 2), 'utf-8');
  } catch (fileErr) {
    console.error('Error writing moderation event to local file:', fileErr);
  }

  // 2. Persist to remote Supabase if available
  const sb = getServerSupabase();
  if (sb) {
    try {
      const { error: insertErr } = await sb.from('moderation_logs').insert({
        analysis_id: eventRecord.analysis_id,
        content_id: eventRecord.content_id,
        content_type: eventRecord.content_type,
        target_id: eventRecord.target_id || eventRecord.content_id,
        target_type: eventRecord.content_type,
        user_id: metadata?.userId || null,
        status: eventRecord.status.toLowerCase(),
        decision: eventRecord.decision,
        category: eventRecord.labels[0] || 'General',
        confidence: eventRecord.confidence,
        reason: eventRecord.reason,
        model: eventRecord.model,
        model_version: eventRecord.model_version,
        scores: eventRecord.scores,
        labels: eventRecord.labels,
        evidence: eventRecord.evidence_references || null,
        created_at: eventRecord.timestamps.created_at,
      });

      if (insertErr) {
        // Graceful fallback if table is syncing or partial schema
      }
    } catch {
      // Non-blocking fallback
    }
  }

  return eventRecord;
}

/**
 * Retrieves recorded moderation events for audits and review
 */
export function getPersistedEvents(limit: number = 50): ModerationEventRecord[] {
  return memoryEventBuffer.slice(0, Math.min(limit, 200));
}
