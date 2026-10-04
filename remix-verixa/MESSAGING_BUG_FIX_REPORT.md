# VERIXA — Complete Messaging Bug-Fix & Stabilization Report

**Date:** October 4, 2026  
**System:** VERIXA Realtime Messaging & AI Media Safety Subsystem  
**Scope:** Forward Recipient Routing, Reply Quoting & Persistence, Deletion Permanence, Emoji Reaction Interactions (`+` picker), and Chat Media Safety Inspection  

---

## 1. Forward Bug (User A -> User B Routing)

### 1.1 Root Cause
1. **Hardcoded Recipient Selection:** In `src/context/AppContext.tsx`, `sendMessage` was implemented to only send messages to `activeChatUser.id` (the person in the currently open conversation). It did not accept an explicit `recipientId` parameter.
2. **Missing Argument in Caller:** In `src/pages/MessagesPage.tsx`, `handleForwardMessage(targetUser: User)` invoked `sendMessage(forwardingMessage.text, ...)` without passing `targetUser.id`.
3. **UI Stuck Open on Error:** `setForwardingMessage(null)` and `setForwardSearchQuery('')` were only executed *after* `await sendMessage(...)` completed. If any error occurred (e.g. during moderation or database save), the handler jumped to `catch (err)` without resetting the modal, trapping the user.

### 1.2 Files Changed
- [`src/lib/supabaseServices.ts`](file:///c:/remix-verixa/src/lib/supabaseServices.ts): Extended `SendMessageOptions` with `recipientId?: string`.
- [`src/context/AppContext.tsx`](file:///c:/remix-verixa/src/context/AppContext.tsx): Updated `sendMessage` to resolve `targetReceiverId = options?.recipientId || activeChatUser?.id`. Optimistic UI only appends to the current conversation list if `activeChatUser?.id === targetReceiverId`.
- [`src/pages/MessagesPage.tsx`](file:///c:/remix-verixa/src/pages/MessagesPage.tsx): Updated `handleForwardMessage` to supply `recipientId: targetUser.id` inside `options`.

### 1.3 Exact Data-Flow Correction
```text
Forward Click -> Select User B -> handleForwardMessage(User B)
       ↓
options.recipientId = User B.id
       ↓
AppContext.sendMessage:
  targetReceiverId = options.recipientId (User B.id)
       ↓
Supabase insert:
  sender_id = User A.id
  receiver_id = User B.id
  is_forwarded = true
       ↓
Realtime delivery:
  User B receives forwarded message in their conversation thread
       ↓
Forward UI safely clears and closes on confirmation
```

### 1.4 Verification Result
* **PASS**: Forwarded message routes to selected `targetUser.id` (User B), not the active chat or User A.
* **PASS**: Forward UI closes upon successful delivery; retains state and displays error toast on failure.

---

## 2. Reply Bug (Banner Appears but Reply Disappears)

### 2.1 Root Cause
1. **Optimistic Rendering Disconnect:** In `AppContext.tsx`, optimistic message creation set `replyToMessageId: options?.replyToMessageId`, but left `replyTo: undefined`. In `MessagesPage.tsx`, the quote card rendered conditionally on `msg.replyTo`. Because `replyTo` was undefined, the optimistic message appeared without the quoted preview.
2. **Database Column Non-Existence:** Supabase schema probe confirmed that `messages.reply_to_message_id` does not exist as a native column in the live `public.messages` table. When `fullPayload` was inserted, Supabase rejected the query (`column messages.reply_to_message_id does not exist`).
3. **Lossy Fallback:** The previous fallback insert dropped `reply_to_message_id` completely, causing the reply relationship to be wiped out whenever the conversation reloaded or synced via realtime.

### 2.2 Files Changed
- [`src/lib/supabaseServices.ts`](file:///c:/remix-verixa/src/lib/supabaseServices.ts): Implemented resilient embedded metadata (`_v_meta`) fallback for `sendMessage`, `subscribeMessages`, `updateMessageText`, and `toggleMessageReaction`.
- [`src/context/AppContext.tsx`](file:///c:/remix-verixa/src/context/AppContext.tsx): Populated `replyTo: options?.replyTo` in the optimistic message.
- [`src/pages/MessagesPage.tsx`](file:///c:/remix-verixa/src/pages/MessagesPage.tsx): In `handleSend` and `sendAttachment`, constructed the complete `replyTo` snapshot (id, senderId, senderName, text, isVoice, mediaUrl) and passed it to `sendMessage`.

### 2.3 Reply Persistence Solution
* **Dual-Layer Architecture:**
  1. `sendMessage` attempts inserting native columns (`reply_to_message_id`, `is_forwarded`, etc.).
  2. If the database schema has not yet been migrated, the fallback packs the metadata into `_v_meta` inside `text`:
     ```json
     {"_v_meta":{"replyToId":"...","replyTo":{"id":"...","text":"...","senderName":"..."},"isForwarded":true},"text":"actual message"}
     ```
  3. `subscribeMessages` unpacks `_v_meta` transparently. Both local optimistic messages and fetched remote messages render the quoted message card with zero data loss.
  4. Clicking the quote smoothly scrolls to the target message and highlights it.

### 2.4 Verification Result
* **PASS**: Replying shows the quoted banner in composer, quoted bubble in the sent message, and persists across page reloads and realtime synchronization.

---

## 3. Delete Bug (Tombstones Cannot Be Deleted Again)

### 3.1 Root Cause & Deletion Policy
1. **Missing `deleted_at` Column:** `public.messages` lacked a `deleted_at` column, causing `deleteMessageSoft` updates to fail on the database.
2. **Dead Button & Hidden Actions:** `MessagesPage.tsx` wrapped the action toolbar with `{!isDeleted && (...)}`. Once marked deleted, the tombstone bubble had no actions or buttons, leaving no way to permanently delete the tombstone.
3. **Policy Determination:**
   - **Tombstone Preservation (Soft Delete):** When an active message is deleted, it is replaced with *"This message was deleted"* to preserve conversation ordering and reply references.
   - **Tombstone Permanent Removal (Author Privilege):** If the author of the deleted message chooses to remove the tombstone from the chat history, they can explicitly permanently delete the row.

### 3.2 Files Changed
- [`src/lib/supabaseServices.ts`](file:///c:/remix-verixa/src/lib/supabaseServices.ts): 
  - `deleteMessageSoft`: Resiliently updates `text: 'This message was deleted'` and clears `media_url` and `is_voice` even if `deleted_at` column is missing.
  - `deleteMessagePermanent`: Executes `supabase.from('messages').delete().eq('id', messageId).eq('sender_id', senderId)`.
- [`src/context/AppContext.tsx`](file:///c:/remix-verixa/src/context/AppContext.tsx): Added and exported `deleteMessagePermanent`.
- [`src/pages/MessagesPage.tsx`](file:///c:/remix-verixa/src/pages/MessagesPage.tsx):
  - On active messages, author can soft-delete.
  - On tombstones, author sees a subtle `"Delete permanently"` button.
  - Added dedicated confirmation modal preventing accidental permanent deletion.

### 3.3 Verification Result
* **PASS**: Author deletes active message -> turns into *"This message was deleted"*.
* **PASS**: Author clicks "Delete permanently" on tombstone -> confirms modal -> row is removed from chat.
* **PASS**: Non-authors cannot delete another user's messages or tombstones.

---

## 4. Emoji Reaction Bug (Hover Dependency & `+` Picker)

### 4.1 Root Cause
1. In `MessagesPage.tsx`, the action toolbar was styled with `opacity-0 group-hover:opacity-100` and the reaction strip was styled with `hidden group-hover/reactions:flex`.
2. On touch devices, mobile screens, or keyboard interaction, CSS `:hover` never fires, making reactions completely inaccessible.
3. There was no `+` button to open a broader emoji palette.

### 4.2 Implementation
1. **Explicit Click / Tap Toggle:** Replaced `:hover` with `activeReactionMessageId === msg.id`. Clicking or tapping the reaction button (😊) toggles the picker open/closed.
2. **Mobile Menu Integration:** Added an explicit *"React with emoji"* action in the message dropdown menu for small screens.
3. **`+` Button Integration:** Added a `+` button at the end of the quick reaction strip (`❤️`, `👍`, `😂`, `😮`, `😢`, `🔥`, `+`).
4. **Categorized Emoji Palette:** Clicking `+` opens a responsive modal with organized emoji categories:
   - Smileys & Emotion (😀, 😂, 😍, 🥳, 🥺, 😭, 🤯, etc.)
   - Gestures & People (👍, 👎, 👏, 🙌, 🤝, 🙏, ✌️, etc.)
   - Hearts & Love (❤️, 🧡, 💛, 💚, 💙, 💜, 💔, 💕, etc.)
   - Celebration & Symbols (🔥, ✨, ⭐, 💥, 💯, 🎉, 🚀, 💡, 💎, etc.)
5. **Reaction Persistence:** Toggling reactions updates local count immediately and persists to Supabase (via native column or embedded metadata).

### 4.3 Verification Result
* **PASS**: Clicking/tapping reaction button opens quick reaction bar without hover.
* **PASS**: Clicking `+` opens categorized emoji picker.
* **PASS**: Selecting emoji adds/toggles reaction and increments counter pill.

---

## 5. Chat Media Safety Bug (`Could not fetch or decode image media...`)

### 5.1 Root Cause & Investigation
* **Investigation Findings:**
  1. Gemini visual models (`gemini-3.1-flash-lite` and `gemini-3.8-flash`) are 100% active and functioning.
  2. The issue was that `uploadMessageAttachment` returned a relative storage path (e.g. `1e71840f-a4ce-4b73-bbf8-686e7235d3c9/messages/17894...png`).
  3. `AppContext.tsx` sent this raw storage path directly to `/api/moderation/gateway` without generating a signed URL or passing MIME information.
  4. In `server/moderation/mediaAnalyzer.ts`, `resolveMediaPayload` only handled `data:` URLs or URLs starting with `http://` / `https://`. When passed a relative storage path, it returned `null`.
  5. Because `resolveMediaPayload` returned `null`, `analyzeImageMedia` returned:
     ```text
     reason: "Could not fetch or decode image media for safety inspection. Held in quarantine for review."
     decision: "QUARANTINE"
     allowed: false
     ```
  6. In addition, voice notes (`isVoice: true`) were being sent as `dm_audio` without audio distinction, attempting to scan voice recordings with vision AI.

### 5.2 Technical Fix
1. **Multi-Strategy Resolver in `server/moderation/mediaAnalyzer.ts`:**
   - **Data URLs:** Parses base64 data and MIME type directly.
   - **Remote URLs:** Fetches HTTP/HTTPS URLs with content-type inspection and extension fallback.
   - **Supabase Storage Paths:** Directly downloads object bytes from the private `app-files` bucket using Supabase Storage client or creates a temporary signed URL. Converts bytes to base64 for Gemini vision model.
2. **Client Preparation in `src/context/AppContext.tsx`:**
   - Differentiates voice audio notes from visual media attachments. Voice notes are not routed to visual models.
   - For images/videos/GIFs, generates a fresh 1-hour signed URL (`getSignedMediaUrl`) and passes `storage_path`, `content_type`, and `mime_type` to `/api/moderation/gateway`.
3. **Fail-Closed Policy Maintained:**
   - If media contains NSFW, violence, weapons, or gore, it is genuinely blocked (`Media blocked: This media did not pass Verixa's safety check`).
   - If technical issues occur, it is held for review (`Media is under review`).
   - Valid images resolve bytes cleanly and pass AI inspection with real safety scores.

### 5.3 Verification Result
* **PASS**: Tested safe PNG via gateway -> `allowed: true`, `decision: "ALLOW"`, no false quarantine.
* **PASS**: Tested storage path resolution -> downloads object bytes directly from `app-files` and completes inspection.

---

## 6. Database Schema Documentation

No destructive database changes were made. All features operate using defensive fallbacks.

If the administrator wishes to add native columns to `public.messages` in the Supabase SQL editor:
```sql
-- Optional Schema Migration for Native Columns:
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_name TEXT,
  ADD COLUMN IF NOT EXISTS media_size BIGINT,
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id);
```

---

## 7. Storage Security Documentation

* **Bucket:** `app-files` (Supabase Storage)
* **Access Level:** **Strictly Private** (no public bucket access granted)
* **Access Mechanism:** HMAC-signed URLs with 1-hour TTL generated on-demand
* **Storage Paths:** `{userId}/messages/{timestamp}_{uuid}.{ext}`
* **Security & RLS:** All uploads require authenticated Supabase user session; path ownership enforced.

---

## 8. Test Matrix & Results

| Test Category | Test Description | Result |
| :--- | :--- | :--- |
| **Forward** | Forward to selected User B from any conversation | **PASS** |
| **Forward** | Forward UI closes upon completion | **PASS** |
| **Forward** | Forward UI retains state and reports error on failure | **PASS** |
| **Reply** | Composer shows quoted reply banner | **PASS** |
| **Reply** | Sent message displays quoted preview bubble | **PASS** |
| **Reply** | Click quoted preview scrolls to and highlights target | **PASS** |
| **Reply** | Reply relationship persists across page refresh | **PASS** |
| **Delete** | Sender soft-deletes active message to tombstone | **PASS** |
| **Delete** | Sender permanently deletes tombstone from conversation | **PASS** |
| **Delete** | Non-author cannot delete other user's message | **PASS** |
| **Reactions** | Click/tap opens quick reaction bar (no hover needed) | **PASS** |
| **Reactions** | Click `+` button opens categorized emoji picker | **PASS** |
| **Reactions** | Add, change, and toggle-off reaction emojis | **PASS** |
| **Media** | Valid image upload resolves bytes without false quarantine | **PASS** |
| **Media** | AI Moderation Gateway inspects media and returns real scores | **PASS** |
| **Media** | Voice audio notes do not fail visual media inspection | **PASS** |
| **Compilation** | `npm run build` (Vite + esbuild) | **PASS** (0 errors) |
| **Lint** | `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) |

---

## 9. Remaining Issues
None. All 5 identified messaging bugs have been resolved, verified, and compiled with zero errors.
