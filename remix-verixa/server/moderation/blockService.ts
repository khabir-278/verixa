/**
 * VERIXA Authoritative Mutual Block Service
 *
 * Enforces the platform-wide mutual blocking policy:
 *   isBlocked(A, B) = (A blocked B) OR (B blocked A)
 *
 * Capabilities:
 * - Durable local persistence (data/blocked_users.json)
 * - Bidirectional in-memory indexes (blockedByViewer & blockedByTarget) for O(1) feed/API checks
 * - Automatic hydration from Supabase public.blocked_users & public.moderation_logs
 * - Server-side JWT session verification to prevent client ID spoofing / impersonation
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BlockedUserEntry {
  id: string;
  blockerId: string;
  blockedId: string;
  name: string;
  username: string;
  avatar: string;
  reason: string;
  blockedAt: string;
}

interface BlockedUsersStoreData {
  blocks: Record<string, BlockedUserEntry[]>; // keyed by blockerId
  unblockedIds: Record<string, string[]>; // keyed by blockerId -> explicitly unblocked targetIds
}

const DATA_DIR = path.join(process.cwd(), 'data');
const BLOCKED_USERS_FILE = path.join(DATA_DIR, 'blocked_users.json');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ServerEnvReadiness {
  supabaseUrlConfigured: boolean;
  supabaseAnonKeyConfigured: boolean;
  serviceRoleKeyConfigured: boolean;
  adminSecretTokenConfigured: boolean;
}

export function getServerEnvReadiness(): ServerEnvReadiness {
  const sbUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const adminSecretToken = (
    process.env.ADMIN_SECRET_TOKEN ||
    process.env.ADMIN_SECRET_KEY ||
    ''
  ).trim();

  return {
    supabaseUrlConfigured: Boolean(sbUrl && sbUrl.startsWith('https://')),
    supabaseAnonKeyConfigured: Boolean(anonKey),
    serviceRoleKeyConfigured: Boolean(serviceRoleKey && serviceRoleKey.length >= 20),
    adminSecretTokenConfigured: Boolean(adminSecretToken && adminSecretToken.length >= 16),
  };
}

export function getServerSupabase(
  authHeader?: string,
  options?: { useServiceRole?: boolean }
): SupabaseClient | null {
  const sbUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://jnbaumemwxydjktwedtz.supabase.co'
  ).trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2'
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  // User-scoped requests (authHeader provided without explicit useServiceRole=true)
  // MUST continue using the publishable/anon key + caller Authorization header so RLS applies.
  const useServiceRole =
    options?.useServiceRole === true
      ? Boolean(serviceRoleKey)
      : !authHeader && Boolean(serviceRoleKey);

  const sbKey = useServiceRole ? serviceRoleKey : anonKey;
  if (!sbUrl || !sbKey) return null;
  try {
    const clientOptions: any = { auth: { persistSession: false, autoRefreshToken: false } };
    if (authHeader && !useServiceRole) {
      clientOptions.global = { headers: { Authorization: authHeader } };
    }
    return createClient(sbUrl, sbKey, clientOptions);
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    if (typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp <= nowSec) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

class BlockService {
  private store: BlockedUsersStoreData = { blocks: {}, unblockedIds: {} };
  // blockerId -> Set of blockedId
  private blockedByMap: Map<string, Set<string>> = new Map();
  // blockedId -> Set of blockerId
  private blockedMeMap: Map<string, Set<string>> = new Map();
  // username (lowercase) -> userId mapping for fast resolution
  private usernameToIdMap: Map<string, string> = new Map();
  // pairKey (blockerId:targetId) -> timestamp (ms) of latest known state transition
  private pairStateTimestampMs: Map<string, number> = new Map();
  private lastSupabaseSyncMs = 0;
  private lastUserSyncMs: Map<string, number> = new Map();
  private readonly isProductionEphemeral =
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.DISABLE_JSON_BLOCK_STORE === 'true';

  constructor() {
    this.loadFromDisk();
    this.rebuildIndexes();
    // Initial background hydration from Supabase
    this.syncFromSupabase(true).catch(() => {});
  }

  private loadFromDisk(): void {
    // In production (e.g. Render ephemeral filesystem), do not trust stale local JSON over Supabase
    if (this.isProductionEphemeral && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(BLOCKED_USERS_FILE)) {
        const raw = fs.readFileSync(BLOCKED_USERS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.store = {
            blocks: parsed.blocks || {},
            unblockedIds: parsed.unblockedIds || {},
          };
        }
      }
    } catch (err) {
      console.warn('Notice loading blocked_users.json in BlockService:', err);
    }
  }

  public saveToDisk(): void {
    if (this.isProductionEphemeral && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(BLOCKED_USERS_FILE, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving blocked_users.json in BlockService:', err);
    }
  }

  private rebuildIndexes(): void {
    this.blockedByMap.clear();
    this.blockedMeMap.clear();

    for (const [blockerId, entries] of Object.entries(this.store.blocks)) {
      if (!Array.isArray(entries)) continue;
      const unblockedSet = new Set(this.store.unblockedIds[blockerId] || []);

      for (const entry of entries) {
        const targetId = entry.blockedId || entry.id;
        if (!targetId || targetId === blockerId || unblockedSet.has(targetId)) continue;

        if (!this.blockedByMap.has(blockerId)) {
          this.blockedByMap.set(blockerId, new Set());
        }
        this.blockedByMap.get(blockerId)!.add(targetId);

        if (!this.blockedMeMap.has(targetId)) {
          this.blockedMeMap.set(targetId, new Set());
        }
        this.blockedMeMap.get(targetId)!.add(blockerId);

        if (entry.username && entry.username !== 'blocked_user') {
          this.usernameToIdMap.set(entry.username.toLowerCase(), targetId);
        }
      }
    }
  }

  public registerUsernameMapping(username?: string | null, userId?: string | null): void {
    if (!username || !userId) return;
    const cleanUser = username.trim().toLowerCase();
    const cleanId = userId.trim();
    if (cleanUser && cleanId && cleanUser !== 'blocked_user') {
      this.usernameToIdMap.set(cleanUser, cleanId);
    }
  }

  /**
   * Resolves a user identifier (UUID or username) to canonical user ID if known
   */
  public resolveCanonicalId(idOrUsername?: string | null): string {
    if (!idOrUsername) return '';
    const trimmed = idOrUsername.trim();
    if (!trimmed) return '';
    if (UUID_REGEX.test(trimmed)) return trimmed;
    const mapped = this.usernameToIdMap.get(trimmed.toLowerCase());
    return mapped || trimmed;
  }

  /**
   * Synchronizes block records from Supabase public.blocked_users and public.moderation_logs.
   * Supports both global sync (service role) and user-scoped sync (with caller's Bearer JWT).
   */
  public async syncFromSupabase(
    force = false,
    authHeader?: string,
    scopedUserId?: string
  ): Promise<void> {
    const now = Date.now();
    if (scopedUserId) {
      const lastUserSync = this.lastUserSyncMs.get(scopedUserId) || 0;
      if (!force && now - lastUserSync < 3_000) {
        return;
      }
      this.lastUserSyncMs.set(scopedUserId, now);
    } else {
      if (!force && now - this.lastSupabaseSyncMs < 5_000) {
        return;
      }
      this.lastSupabaseSyncMs = now;
    }

    const serviceRoleClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? getServerSupabase(undefined, { useServiceRole: true })
      : null;
    const userScopedClient = authHeader
      ? getServerSupabase(authHeader, { useServiceRole: false })
      : null;
    const sb = serviceRoleClient || userScopedClient || getServerSupabase(authHeader);
    if (!sb) return;

    let changed = false;
    const activeDbPairs = new Set<string>();

    // 1. Authoritative sync from public.blocked_users table
    try {
      let activeClient = sb;
      let usingServiceRole = Boolean(serviceRoleClient);
      let query = activeClient
        .from('blocked_users')
        .select('blocker_id, blocked_id, reason, created_at')
        .order('created_at', { ascending: false });

      if (scopedUserId && UUID_REGEX.test(scopedUserId) && !usingServiceRole) {
        query = query.or(`blocker_id.eq.${scopedUserId},blocked_id.eq.${scopedUserId}`);
      }

      let { data: sbBlocks, error } = await query;

      // If service-role client failed and we have a user-scoped client, fall back safely
      if ((error || !Array.isArray(sbBlocks)) && usingServiceRole && userScopedClient) {
        activeClient = userScopedClient;
        usingServiceRole = false;
        let fallbackQuery = activeClient
          .from('blocked_users')
          .select('blocker_id, blocked_id, reason, created_at')
          .order('created_at', { ascending: false });
        if (scopedUserId && UUID_REGEX.test(scopedUserId)) {
          fallbackQuery = fallbackQuery.or(
            `blocker_id.eq.${scopedUserId},blocked_id.eq.${scopedUserId}`
          );
        }
        const fbRes = await fallbackQuery;
        sbBlocks = fbRes.data;
        error = fbRes.error;
      }

      if (!error && Array.isArray(sbBlocks)) {
        const hasFullVisibility = usingServiceRole;

        for (const row of sbBlocks) {
          const blockerId = row.blocker_id;
          const blockedId = row.blocked_id;
          if (!blockerId || !blockedId || blockerId === blockedId) continue;

          const pairKey = `${blockerId}:${blockedId}`;
          activeDbPairs.add(pairKey);

          const rowTimeMs = row.created_at ? new Date(row.created_at).getTime() : now;
          const prevTimeMs = this.pairStateTimestampMs.get(pairKey) || 0;

          // If a newer local unblock happened within the last 5 seconds before DB propagation, skip stale read
          if (
            prevTimeMs > rowTimeMs + 1000 &&
            (this.store.unblockedIds[blockerId] || []).includes(blockedId)
          ) {
            continue;
          }

          this.pairStateTimestampMs.set(pairKey, Math.max(prevTimeMs, rowTimeMs));

          // Active row in public.blocked_users MUST clear any stale unblockedIds entry (fixes re-block bug)
          if (this.store.unblockedIds[blockerId]?.includes(blockedId)) {
            this.store.unblockedIds[blockerId] = this.store.unblockedIds[blockerId].filter(
              (id) => id !== blockedId
            );
            changed = true;
          }

          if (!this.store.blocks[blockerId]) {
            this.store.blocks[blockerId] = [];
          }
          const exists = this.store.blocks[blockerId].some(
            (b) => (b.blockedId || b.id) === blockedId
          );
          if (!exists) {
            this.store.blocks[blockerId].push({
              id: blockedId,
              blockerId,
              blockedId,
              name: 'Blocked User',
              username: 'blocked_user',
              avatar: '',
              reason: row.reason || 'Blocked by user',
              blockedAt: row.created_at || new Date().toISOString(),
            });
            changed = true;
          }
        }

        // Reconcile removed blocks when we have authoritative visibility
        if (hasFullVisibility) {
          for (const [blockerId, entries] of Object.entries(this.store.blocks)) {
            const beforeLen = entries.length;
            this.store.blocks[blockerId] = entries.filter((entry) => {
              const targetId = entry.blockedId || entry.id;
              if (!UUID_REGEX.test(targetId)) return true;
              const pairKey = `${blockerId}:${targetId}`;
              return activeDbPairs.has(pairKey);
            });
            if (this.store.blocks[blockerId].length !== beforeLen) {
              changed = true;
            }
          }
        } else if (authHeader && scopedUserId && UUID_REGEX.test(scopedUserId)) {
          const entries = this.store.blocks[scopedUserId] || [];
          const beforeLen = entries.length;
          this.store.blocks[scopedUserId] = entries.filter((entry) => {
            const targetId = entry.blockedId || entry.id;
            if (!UUID_REGEX.test(targetId)) return true;
            const pairKey = `${scopedUserId}:${targetId}`;
            const recentWriteMs = this.pairStateTimestampMs.get(pairKey) || 0;
            if (now - recentWriteMs < 3_000) return true;
            return activeDbPairs.has(pairKey);
          });
          if (this.store.blocks[scopedUserId].length !== beforeLen) {
            changed = true;
          }
        }
      }

      // 1b. Bilateral restriction sync via SECURITY DEFINER RPC get_my_restricted_user_ids()
      //     Ensures user-scoped JWT requests also enforce blocks where blocked_id = scopedUserId
      //     even when direct SELECT on public.blocked_users is restricted to blocker_id = auth.uid().
      if (authHeader && scopedUserId && UUID_REGEX.test(scopedUserId) && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const { data: rpcRestricted, error: rpcErr } = await sb.rpc('get_my_restricted_user_ids');
          if (!rpcErr && Array.isArray(rpcRestricted)) {
            const restrictedSet = new Set<string>();
            for (const item of rpcRestricted) {
              const otherId = typeof item === 'string' ? item : item?.restricted_user_id || item?.id;
              if (otherId && UUID_REGEX.test(otherId) && otherId !== scopedUserId) {
                restrictedSet.add(otherId);
                const forwardKey = `${scopedUserId}:${otherId}`;
                const reverseKey = `${otherId}:${scopedUserId}`;
                activeDbPairs.add(reverseKey);

                if (!activeDbPairs.has(forwardKey)) {
                  if (!this.store.blocks[otherId]) {
                    this.store.blocks[otherId] = [];
                  }
                  const revExists = this.store.blocks[otherId].some(
                    (b) => (b.blockedId || b.id) === scopedUserId
                  );
                  if (!revExists) {
                    this.store.blocks[otherId].push({
                      id: scopedUserId,
                      blockerId: otherId,
                      blockedId: scopedUserId,
                      name: 'Restricted Account',
                      username: 'blocked_user',
                      avatar: '',
                      reason: 'Mutual privacy restriction',
                      blockedAt: new Date().toISOString(),
                    });
                    changed = true;
                  }
                }
              }
            }

            // Reconcile any stale reverse blocks targeting scopedUserId that were lifted
            for (const [otherBlockerId, entries] of Object.entries(this.store.blocks)) {
              if (otherBlockerId === scopedUserId || !UUID_REGEX.test(otherBlockerId)) continue;
              const prevLen = entries.length;
              this.store.blocks[otherBlockerId] = entries.filter((entry) => {
                const targetId = entry.blockedId || entry.id;
                if (targetId !== scopedUserId) return true;
                const pairKey = `${otherBlockerId}:${scopedUserId}`;
                const recentWriteMs = this.pairStateTimestampMs.get(pairKey) || 0;
                if (now - recentWriteMs < 3_000) return true;
                return restrictedSet.has(otherBlockerId);
              });
              if (this.store.blocks[otherBlockerId].length !== prevLen) {
                changed = true;
              }
            }
          }
        } catch {
          // RPC may not be deployed yet prior to Phase 2 migration
        }
      }
    } catch {
      // Table may be restricted by RLS if no token was supplied
    }

    // 2. Fallback / supplemental sync from public.moderation_logs
    try {
      const { data: modLogs, error: modErr } = await sb
        .from('moderation_logs')
        .select('user_id, target_id, status, category, reason, created_at')
        .eq('target_type', 'user')
        .in('category', ['USER_BLOCK', 'USER_UNBLOCK'])
        .order('created_at', { ascending: false })
        .limit(500);

      if (!modErr && Array.isArray(modLogs)) {
        const processedPairs = new Set<string>();
        for (const log of modLogs) {
          const blockerId = log.user_id;
          const targetId = log.target_id;
          if (!blockerId || !targetId || blockerId === targetId) continue;

          const pairKey = `${blockerId}:${targetId}`;
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          const logTimeMs = log.created_at ? new Date(log.created_at).getTime() : 0;
          const knownTimeMs = this.pairStateTimestampMs.get(pairKey) || 0;
          if (knownTimeMs > logTimeMs + 1000) {
            // In-memory state is newer than this log entry
            continue;
          }
          if (logTimeMs > 0) {
            this.pairStateTimestampMs.set(pairKey, logTimeMs);
          }

          if (log.category === 'USER_UNBLOCK' || log.status === 'approved') {
            // Only honor unblock log if not superseded by an active row in blocked_users
            if (activeDbPairs.has(pairKey)) continue;

            if (!this.store.unblockedIds[blockerId]) {
              this.store.unblockedIds[blockerId] = [];
            }
            if (!this.store.unblockedIds[blockerId].includes(targetId)) {
              this.store.unblockedIds[blockerId].push(targetId);
              changed = true;
            }
            if (this.store.blocks[blockerId]) {
              const prevLen = this.store.blocks[blockerId].length;
              this.store.blocks[blockerId] = this.store.blocks[blockerId].filter(
                (b) => (b.blockedId || b.id) !== targetId
              );
              if (this.store.blocks[blockerId].length !== prevLen) changed = true;
            }
          } else if (log.category === 'USER_BLOCK' && log.status === 'blocked') {
            // Newest log is USER_BLOCK -> remove from unblockedIds (fixes re-block bug!)
            if (this.store.unblockedIds[blockerId]?.includes(targetId)) {
              this.store.unblockedIds[blockerId] = this.store.unblockedIds[blockerId].filter(
                (id) => id !== targetId
              );
              changed = true;
            }

            if (!this.store.blocks[blockerId]) {
              this.store.blocks[blockerId] = [];
            }
            const exists = this.store.blocks[blockerId].some(
              (b) => (b.blockedId || b.id) === targetId
            );
            if (!exists) {
              let meta: any = {};
              if (log.reason && log.reason.startsWith('{')) {
                try {
                  meta = JSON.parse(log.reason);
                } catch {}
              }
              this.store.blocks[blockerId].push({
                id: targetId,
                blockerId,
                blockedId: targetId,
                name: meta.name || 'Blocked User',
                username: meta.username || 'blocked_user',
                avatar: meta.avatar || '',
                reason: meta.reason || log.reason || 'Blocked by user',
                blockedAt: log.created_at || new Date().toISOString(),
              });
              changed = true;
            }
          }
        }
      }
    } catch {}

    if (changed) {
      this.rebuildIndexes();
      this.saveToDisk();
    }
  }

  /**
   * Authoritative Mutual Block Check:
   * isBlocked(A, B) = (A blocked B) OR (B blocked A)
   */
  public isMutuallyBlocked(userA?: string | null, userB?: string | null): boolean {
    if (!userA || !userB) return false;
    const a = this.resolveCanonicalId(userA);
    const b = this.resolveCanonicalId(userB);
    if (!a || !b || a === b) return false;

    const aBlockedB = this.blockedByMap.get(a)?.has(b) || false;
    const bBlockedA = this.blockedByMap.get(b)?.has(a) || false;
    return aBlockedB || bBlockedA;
  }

  /**
   * Detailed directional block relationship between viewer and target
   */
  public getBlockRelationship(
    viewerId?: string | null,
    targetId?: string | null
  ): {
    isBlocked: boolean;
    blockedByViewer: boolean;
    blockedByTarget: boolean;
  } {
    if (!viewerId || !targetId) {
      return { isBlocked: false, blockedByViewer: false, blockedByTarget: false };
    }
    const v = this.resolveCanonicalId(viewerId);
    const t = this.resolveCanonicalId(targetId);
    if (!v || !t || v === t) {
      return { isBlocked: false, blockedByViewer: false, blockedByTarget: false };
    }

    const blockedByViewer = this.blockedByMap.get(v)?.has(t) || false;
    const blockedByTarget = this.blockedByMap.get(t)?.has(v) || false;
    return {
      isBlocked: blockedByViewer || blockedByTarget,
      blockedByViewer,
      blockedByTarget,
    };
  }

  /**
   * Returns all user IDs that are mutually restricted with userId (blockedByMe U blockedMe).
   * Used for filtering feeds, stories, reels, search, suggestions, and notifications.
   */
  public getMutuallyRestrictedIds(userId?: string | null): Set<string> {
    const result = new Set<string>();
    if (!userId) return result;
    const uid = this.resolveCanonicalId(userId);
    if (!uid) return result;

    const byMe = this.blockedByMap.get(uid);
    if (byMe) {
      byMe.forEach((id) => result.add(id));
    }
    const byThem = this.blockedMeMap.get(uid);
    if (byThem) {
      byThem.forEach((id) => result.add(id));
    }
    return result;
  }

  /**
   * Returns only the user IDs that viewerId personally blocked.
   */
  public getBlockedByViewerIds(viewerId?: string | null): Set<string> {
    const result = new Set<string>();
    if (!viewerId) return result;
    const uid = this.resolveCanonicalId(viewerId);
    const byMe = this.blockedByMap.get(uid);
    if (byMe) {
      byMe.forEach((id) => result.add(id));
    }
    return result;
  }

  /**
   * Records a block relationship (blockerId -> targetUserId) idempotently.
   */
  public recordBlock(params: {
    blockerId: string;
    targetUserId: string;
    name?: string;
    username?: string;
    avatar?: string;
    reason?: string;
  }): BlockedUserEntry {
    const {
      blockerId,
      targetUserId,
      name = 'Blocked User',
      username = 'blocked_user',
      avatar = '',
      reason = 'Blocked by user',
    } = params;

    if (!blockerId || !targetUserId) {
      throw new Error('blockerId and targetUserId are required');
    }
    if (blockerId === targetUserId) {
      throw new Error('You cannot block yourself');
    }

    const nowIso = new Date().toISOString();
    this.pairStateTimestampMs.set(`${blockerId}:${targetUserId}`, Date.now());

    if (!this.store.blocks[blockerId]) {
      this.store.blocks[blockerId] = [];
    }
    if (!this.store.unblockedIds[blockerId]) {
      this.store.unblockedIds[blockerId] = [];
    }

    this.store.unblockedIds[blockerId] = this.store.unblockedIds[blockerId].filter(
      (id) => id !== targetUserId
    );

    const existingIdx = this.store.blocks[blockerId].findIndex(
      (b) => b.blockedId === targetUserId || b.id === targetUserId
    );

    const entry: BlockedUserEntry = {
      id: targetUserId,
      blockerId,
      blockedId: targetUserId,
      name,
      username,
      avatar,
      reason,
      blockedAt: nowIso,
    };

    if (existingIdx >= 0) {
      this.store.blocks[blockerId][existingIdx] = entry;
    } else {
      this.store.blocks[blockerId].unshift(entry);
    }

    this.rebuildIndexes();
    this.saveToDisk();
    return entry;
  }

  /**
   * Removes a block relationship (blockerId -> targetUserId) idempotently.
   * Note: If targetUserId also blocked blockerId, that reverse block remains intact.
   */
  public removeBlock(blockerId: string, targetUserId: string): void {
    if (!blockerId || !targetUserId) return;

    this.pairStateTimestampMs.set(`${blockerId}:${targetUserId}`, Date.now());

    if (this.store.blocks[blockerId]) {
      this.store.blocks[blockerId] = this.store.blocks[blockerId].filter(
        (b) => b.blockedId !== targetUserId && b.id !== targetUserId
      );
    }
    if (!this.store.unblockedIds[blockerId]) {
      this.store.unblockedIds[blockerId] = [];
    }
    if (!this.store.unblockedIds[blockerId].includes(targetUserId)) {
      this.store.unblockedIds[blockerId].push(targetUserId);
    }

    this.rebuildIndexes();
    this.saveToDisk();
  }

  /**
   * Returns entries personally blocked by blockerId
   */
  public getStoreEntriesForBlocker(blockerId: string): BlockedUserEntry[] {
    const unblockedSet = new Set(this.store.unblockedIds[blockerId] || []);
    return (this.store.blocks[blockerId] || []).filter(
      (item) => !unblockedSet.has(item.blockedId || item.id)
    );
  }

  public isExplicitlyUnblocked(blockerId: string, targetId: string): boolean {
    return (this.store.unblockedIds[blockerId] || []).includes(targetId);
  }

  /**
   * Strictly verifies the authenticated user from a Supabase Bearer JWT token.
   * All dev_* bypasses and unauthenticated fallbacks have been removed.
   * Prevents a client from spoofing another user's ID in request bodies or query strings.
   */
  public async verifyRequestActor(
    authHeader?: string,
    claimedUserId?: string | null
  ): Promise<{
    actorId: string | null;
    token: string | null;
    verifiedByToken: boolean;
    impersonationAttempt: boolean;
    authError?: string;
  }> {
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return {
        actorId: null,
        token: null,
        verifiedByToken: false,
        impersonationAttempt: false,
        authError: 'Authentication required: missing Authorization Bearer token',
      };
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return {
        actorId: null,
        token: null,
        verifiedByToken: false,
        impersonationAttempt: false,
        authError: 'Authentication required: empty Bearer token',
      };
    }

    // Explicitly reject any synthetic dev_* tokens or malformed/expired JWTs
    if (token.startsWith('dev_') || isJwtExpired(token)) {
      return {
        actorId: null,
        token: null,
        verifiedByToken: false,
        impersonationAttempt: false,
        authError: 'Invalid or expired authentication token',
      };
    }

    const sb = getServerSupabase(authHeader, { useServiceRole: false });
    if (!sb) {
      return {
        actorId: null,
        token: null,
        verifiedByToken: false,
        impersonationAttempt: false,
        authError: 'Authentication service unavailable',
      };
    }

    try {
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data?.user?.id) {
        return {
          actorId: null,
          token: null,
          verifiedByToken: false,
          impersonationAttempt: false,
          authError: error?.message || 'Invalid or expired authentication token',
        };
      }

      const verifiedId = data.user.id;
      const verifiedUsername = (data.user.user_metadata?.username || '').toLowerCase();
      if (verifiedUsername) {
        this.registerUsernameMapping(verifiedUsername, verifiedId);
      }

      if (claimedUserId && typeof claimedUserId === 'string' && claimedUserId.trim() !== '') {
        const cleanClaim = claimedUserId.trim();
        const resolvedClaim = this.resolveCanonicalId(cleanClaim);
        const matchesId =
          cleanClaim.toLowerCase() === verifiedId.toLowerCase() ||
          resolvedClaim.toLowerCase() === verifiedId.toLowerCase();
        const matchesUsername =
          verifiedUsername && cleanClaim.toLowerCase() === verifiedUsername;

        if (!matchesId && !matchesUsername) {
          return {
            actorId: verifiedId,
            token,
            verifiedByToken: true,
            impersonationAttempt: true,
            authError: 'Forbidden: claimed user identity does not match authenticated token',
          };
        }
      }

      return {
        actorId: verifiedId,
        token,
        verifiedByToken: true,
        impersonationAttempt: false,
      };
    } catch {
      return {
        actorId: null,
        token: null,
        verifiedByToken: false,
        impersonationAttempt: false,
        authError: 'Failed to verify authentication token',
      };
    }
  }

  public getEnvReadiness(): ServerEnvReadiness {
    return getServerEnvReadiness();
  }
}

export const blockService = new BlockService();

