/**
 * VERIXA Server-Authoritative Notification Service
 *
 * Implements:
 * - Durable local file persistence (data/notifications.json)
 * - In-memory cache for ultra-fast query and zero lag
 * - Supabase database sync (gracefully handling RLS policies)
 * - Strict prevention of self-notifications (senderId === recipientId)
 * - Read/unread status management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface NotificationRecord {
  id: string;
  recipient_id: string;
  sender_id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'friend_request' | 'ai_warning';
  message: string;
  post_id?: string | null;
  detail?: string | null;
  read: boolean;
  created_at: string;
  sender: {
    id: string;
    username: string;
    name: string;
    avatar?: string;
    verified?: boolean;
    ai_trust_badge?: string;
    safety_score?: number;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// In-memory notifications buffer
const notificationsMemoryBuffer: NotificationRecord[] = [];

// Initialize directory and load persisted notifications
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory for notifications:', err);
  }
}

try {
  if (fs.existsSync(NOTIFICATIONS_FILE)) {
    const raw = fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Purge any legacy self-notifications and keep valid records
      const validRecords = parsed.filter(
        (n: any) => n && n.recipient_id && n.sender_id && n.recipient_id !== n.sender_id
      );
      notificationsMemoryBuffer.push(...validRecords);
    }
  }
} catch (err) {
  console.warn('Notice loading notifications file:', err);
}

function saveNotificationsToFile() {
  try {
    // Only persist valid non-self notifications
    const persistable = notificationsMemoryBuffer.filter(
      (n) => n && n.recipient_id && n.sender_id && n.recipient_id !== n.sender_id
    );
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(persistable.slice(0, 1000), null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist notifications to file:', err);
  }
}

// Server Supabase Client Helper
function getServerSupabase(): SupabaseClient | null {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://jnbaumemwxydjktwedtz.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

  if (!url || !key) return null;

  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}

const isUUID = (str?: string | null): boolean =>
  !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export const notificationService = {
  /**
   * Create and persist a new notification for a recipient
   */
  async createNotification(data: {
    recipientId: string;
    senderId: string;
    type: 'like' | 'comment' | 'follow' | 'mention' | 'friend_request' | 'ai_warning';
    message: string;
    postId?: string;
    detail?: string;
    sender?: {
      id: string;
      username: string;
      name: string;
      avatar?: string;
      verified?: boolean;
      ai_trust_badge?: string;
      safety_score?: number;
    };
  }): Promise<NotificationRecord | null> {
    const { recipientId, senderId, type, message, postId, detail, sender } = data;

    // RULE 1: STRICTLY NO SELF-NOTIFICATIONS!
    if (!recipientId || !senderId || recipientId === senderId) {
      return null;
    }

    // Deduplication check: prevent identical notification within 3 seconds
    const now = Date.now();
    const existingRecent = notificationsMemoryBuffer.find((n) => {
      if (n.recipient_id === recipientId && n.sender_id === senderId && n.type === type && n.post_id === (postId || null)) {
        const diff = now - new Date(n.created_at).getTime();
        return diff >= 0 && diff < 3000;
      }
      return false;
    });

    if (existingRecent) {
      return existingRecent;
    }

    const defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';
    const newRecord: NotificationRecord = {
      id: `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      recipient_id: recipientId,
      sender_id: senderId,
      type,
      message,
      post_id: postId || null,
      detail: detail || null,
      read: false,
      created_at: new Date().toISOString(),
      sender: {
        id: senderId,
        username: sender?.username || 'User',
        name: sender?.name || sender?.username || 'User',
        avatar: sender?.avatar || defaultAvatar,
        verified: sender?.verified ?? true,
        ai_trust_badge: sender?.ai_trust_badge || 'Verified Human',
        safety_score: sender?.safety_score ?? 100,
      },
    };

    // Store in memory (latest first)
    notificationsMemoryBuffer.unshift(newRecord);
    saveNotificationsToFile();

    // Async sync to Supabase if valid UUIDs
    if (isUUID(recipientId) && isUUID(senderId)) {
      const sb = getServerSupabase();
      if (sb) {
        Promise.resolve(
          sb.from('notifications').insert({
            recipient_id: recipientId,
            sender_id: senderId,
            type,
            post_id: isUUID(postId) ? postId : null,
            message,
            read: false,
            created_at: newRecord.created_at,
          })
        ).catch(() => {});
      }
    }

    return newRecord;
  },

  /**
   * Get all notifications for a recipient user
   */
  getNotifications(recipientId: string, limit = 50): NotificationRecord[] {
    if (!recipientId) return [];
    return notificationsMemoryBuffer
      .filter((n) => n.recipient_id === recipientId && n.recipient_id !== n.sender_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  },

  /**
   * Mark all notifications as read for a recipient user
   */
  markAllRead(recipientId: string): number {
    if (!recipientId) return 0;
    let count = 0;
    for (const n of notificationsMemoryBuffer) {
      if (n.recipient_id === recipientId && !n.read) {
        n.read = true;
        count++;
      }
    }
    if (count > 0) {
      saveNotificationsToFile();

      // Async sync to Supabase
      if (isUUID(recipientId)) {
        const sb = getServerSupabase();
        if (sb) {
          Promise.resolve(
            sb.from('notifications')
              .update({ read: true })
              .eq('recipient_id', recipientId)
          ).catch(() => {});
        }
      }
    }
    return count;
  },

  /**
   * Mark a single notification as read
   */
  markOneRead(recipientId: string, notificationId: string): boolean {
    if (!recipientId || !notificationId) return false;
    const item = notificationsMemoryBuffer.find(
      (n) => n.id === notificationId && n.recipient_id === recipientId
    );
    if (item) {
      item.read = true;
      saveNotificationsToFile();

      if (isUUID(recipientId)) {
        const sb = getServerSupabase();
        if (sb) {
          Promise.resolve(
            sb.from('notifications')
              .update({ read: true })
              .eq('recipient_id', recipientId)
          ).catch(() => {});
        }
      }
      return true;
    }
    return false;
  },

  /**
   * Delete a notification
   */
  deleteNotification(recipientId: string, notificationId: string): boolean {
    if (!recipientId || !notificationId) return false;
    const idx = notificationsMemoryBuffer.findIndex(
      (n) => n.id === notificationId && n.recipient_id === recipientId
    );
    if (idx !== -1) {
      notificationsMemoryBuffer.splice(idx, 1);
      saveNotificationsToFile();
      return true;
    }
    return false;
  },
};
