# VERIXA Messaging System — Phase 2 Root Cause & Architectural Audit Report

**Date:** 2026-10-04  
**Author:** Senior/Principal Full-Stack & Realtime Systems Engineer  
**Scope:** Deep Forensic Audit of 6 Messaging System Defects

---

## BUG 1 — Audio Message Temporarily Shows "Audio no longer available"

### Root cause:
When an audio message is recorded, `uploadVoiceNote(currentUser.id, audioBlob)` uploads the audio file to the private Supabase Storage bucket (`app-files`) and returns both `{ path, signedUrl }`. However, `sendVoiceRecording()` only extracted `{ path }` and passed this raw relative storage path (e.g., `userId/audio/voice_123.webm`) into `sendMessage(..., path, ...)`. In `AppContext.tsx`, the optimistic message was instantiated with `mediaUrl: path` (a non-HTTP, non-signed string).
The `ChatVoicePlayer` component directly passed this raw storage path into `<audio src={url}>`. The browser attempted to resolve it as a relative URL (`http://localhost:3000/userId/audio/...`), resulting in an immediate 404 response. The `<audio>` element fired `onError`, setting `hasError: true` and rendering `"This audio message is no longer available."`. Only upon page reload did `fetchMsgs` query Supabase and call `getSignedMediaUrl(row.media_url)`, generating a valid signed URL and restoring playback.

### Files involved:
- `src/pages/MessagesPage.tsx` (`sendVoiceRecording`, `ChatVoicePlayer`)
- `src/context/AppContext.tsx` (`sendMessage`)
- `src/types.ts` (`SendMessageOptions`, `ChatMessage`)
- `src/lib/supabaseServices.ts` (`uploadVoiceNote`, `sendMessage`)

### Data flow:
```text
User records voice note
  ↓
uploadVoiceNote() uploads to Supabase and returns { path, signedUrl }
  ↓
sendVoiceRecording() extracted ONLY path, discarding signedUrl
  ↓
sendMessage('', path, true, duration)
  ↓
optimisticMsg created with mediaUrl = path (relative storage path)
  ↓
ChatVoicePlayer mounts <audio src="userId/audio/...">
  ↓
Browser fetches http://localhost:3000/userId/... → 404 NOT FOUND
  ↓
<audio onError> → hasError = true
  ↓
Renders: "This audio message is no longer available."
  ↓
Page refresh → fetchMsgs() calls getSignedMediaUrl(path) → Playable
```

### Race condition / Failure mode:
Premature rendering of an unresolved private storage reference in the client UI before obtaining or attaching a playable HTTP/Blob/Signed URL.

### Correct fix:
1. In `sendVoiceRecording()`, retain the `signedUrl` returned from `uploadVoiceNote` or create a local `URL.createObjectURL(audioBlob)`. Pass this playable URL via `options.optimisticMediaUrl` to `sendMessage()`.
2. In `AppContext.tsx`, assign `mediaUrl: options?.optimisticMediaUrl || mediaUrl` on the optimistic message so local playback is immediate.
3. In `ChatVoicePlayer`, make the component self-healing: if `url` is a storage path (does not start with `http`, `blob:`, or `data:`), resolve it asynchronously with `getSignedMediaUrl(url)` with loading indicators instead of failing immediately.

---

## BUG 2 — Audio Duration Shows "infinity:NaN"

### Root cause:
WebM audio files generated via the browser `MediaRecorder` API stream audio in chunks and omit the duration header in their container metadata. When the browser `<audio>` element loads a WebM file, `audio.duration` evaluates to `Infinity`.
In `ChatVoicePlayer`, `handleLoadedMetadata` set `totalDuration` to `audioRef.current.duration` (`Infinity`). In `formatTime(secs)`, the guard `if (isNaN(secs) || secs < 0)` was used. Because `isNaN(Infinity)` is `false` and `Infinity < 0` is `false`, `Math.floor(Infinity / 60)` returned `Infinity`, and `Math.floor(Infinity % 60)` in JavaScript evaluated to `NaN`. Combining these in template literal `${mins}:${remainingSecs}` produced `"Infinity:NaN"`.

### Files involved:
- `src/pages/MessagesPage.tsx` (`ChatVoicePlayer`, `formatTime`, `handleLoadedMetadata`)
- `src/lib/supabaseServices.ts` (`sendMessage` fallback insert)

### Incorrect calculation:
```ts
// In formatTime:
Math.floor(Infinity / 60) // => Infinity
Math.floor(Infinity % 60) // => NaN
`${mins}:${remainingSecs}` // => "Infinity:NaN"
```

### Correct fix:
1. Implement a bulletproof duration formatter validating `!Number.isFinite(secs)`:
   ```ts
   const formatTime = (secs: number) => {
     if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '0:00';
     const mins = Math.floor(secs / 60);
     const remainingSecs = Math.floor(secs % 60);
     return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
   };
   ```
2. Prioritize the measured `duration` prop from the voice recorder (`recordingSeconds`) if finite and greater than 0.
3. Implement WebM duration recovery: if `audio.duration === Infinity`, attach a temporary `durationchange` listener, seek `audio.currentTime = 1e101`, and upon duration resolution, reset `audio.currentTime = 0`.
4. Ensure `voiceDuration` is preserved in `metaObj` during fallback inserts in `supabaseServices.ts`.

---

## BUG 3 — Emoji Reaction Bar Overflows Horizontally Outside Viewport

### Root cause:
The quick reaction picker is 232px wide (`w-7` buttons + gap + padding). It was styled with:
`className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 ..."`
relative to the 24px reaction button inside the message toolbar. For opponent messages on the left side of the screen (`isMe === false`), the toolbar is positioned at `left-0`. Centering a 232px bar over a button 25px from the left edge resulted in an offset of `25px - 116px = -91px`, pushing the toolbar 91px off the left edge of the viewport. On mobile or narrow screens for `isMe === true`, centering also pushed the toolbar beyond the right edge of the viewport, triggering horizontal page scroll.

### Files involved:
- `src/pages/MessagesPage.tsx` (reaction toolbar container and picker)

### Positioning issue:
Static center-origin alignment (`left-1/2 -translate-x-1/2`) with fixed minimum width ignoring message alignment (`isMe`) and viewport boundaries.

### Correct fix:
1. Position directionally based on message ownership:
   - For opponent messages (`!isMe`): anchor to `left-0` with `origin-bottom-left`, opening inward to the right.
   - For own messages (`isMe`): anchor to `right-0` with `origin-bottom-right`, opening inward to the left.
2. Constrain maximum width to `max-w-[calc(100vw-32px)]` with horizontal scroll if screen width is extremely constrained.

---

## BUG 4 — Message "More Options" Menu Goes Outside Window

### Root cause:
The message action dropdown menu (width `w-44` = 176px) was hardcoded with `className="absolute right-0 top-full mt-1 w-44 ..."`. For opponent messages on the left side of the chat, the action toolbar is at `left-0`. Aligning the dropdown's right edge to the More button (`x ~ 60px`) caused the left edge to land at `60px - 176px = -116px`, placing the menu 116px off-screen to the left.

### Files involved:
- `src/pages/MessagesPage.tsx` (`activeMenuMessageId` dropdown)

### Positioning issue:
Hardcoded `right-0` alignment and downwards `top-full` projection without boundary checking or orientation awareness.

### Correct fix:
1. Apply directional horizontal alignment:
   - If `isMe`: `right-0` (opens inward to the left).
   - If `!isMe`: `left-0` (opens inward to the right).
2. Apply collision-aware vertical placement: if the message is among the bottom two in the conversation, project upward (`bottom-full mb-1.5`) rather than downward (`top-full mt-1.5`).

---

## BUG 5 — Chat Automatically Scrolls to Bottom After Every Action

### Root cause:
In `MessagesPage.tsx`:
```tsx
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, activeChatUser]);
```
This hook unconditionally called `scrollIntoView()` on every mutation of the `messages` array, treating reactions, edits, soft-deletes, read receipts, and metadata updates identically to brand-new incoming messages. It lacked tracking of user scroll position.

### Files involved:
- `src/pages/MessagesPage.tsx` (`messagesEndRef`, scroll container, `useEffect`)

### Scroll trigger:
Every render where `messages` reference changed, regardless of whether a new message was added or existing message mutated.

### Incorrect behavior:
Forced users who were reading conversation history back to the very bottom whenever any interaction or background sync occurred.

### Correct fix:
1. Bind a `scrollContainerRef` to the scrollable feed container.
2. Track `isNearBottomRef` (within 150px threshold of bottom).
3. Distinguish between message addition vs message mutation:
   - If message count and last message ID did not change (reaction, edit, delete, status): DO NOT scroll.
   - If active chat changed: scroll to bottom immediately (`behavior: 'auto'`).
   - If current user sent a new message: scroll to bottom smoothly.
   - If new incoming message arrived AND `isNearBottomRef.current === true`: scroll to bottom smoothly.
   - If new incoming message arrived AND user was reading older messages: DO NOT scroll; preserve scroll position.

---

## BUG 6 — Chat List Reorders/Jumps When Simply Opening a Chat

### Root cause:
Two coupled flaws:
1. In `MessagesPage.tsx`, an effect listening to `[messages, activeChatUser?.id]` was updating `conversationsMap[activeChatUser.id]`:
   ```tsx
   createdAt: (lastMsg as any).created_at || new Date().toISOString()
   ```
   If `(lastMsg as any).created_at` was missing or stale, it fell back to `new Date().toISOString()`, setting `createdAt` to `Date.now()`. In `contactsToDisplay`, sorting checked `new Date(conversationsMap[id].createdAt).getTime()`, instantly promoting the clicked chat to index 0.
2. In `contactsToDisplay`, unread count was the primary sort key (`unreadB - unreadA`). When a user clicked an unread conversation, `markChatAsRead` synchronously set unread count to 0, causing the conversation to immediately drop or shift position.

### Files involved:
- `src/pages/MessagesPage.tsx` (`contactsToDisplay`, `useEffect` updating `conversationsMap`)
- `src/context/AppContext.tsx` (`activeChatUser` switch effect)

### Ordering mutation:
Updating `createdAt` to `Date.now()` on chat selection and using mutable unread status as the primary sort key.

### Correct fix:
1. Decouple active chat selection from conversation ordering. Selecting a chat must never mutate timestamps in `conversationsMap`.
2. Only update `conversationsMap[partnerId].createdAt` when an authentic new message is sent or received from the database.
3. Sort `contactsToDisplay` deterministically based on the genuine `createdAt` timestamp of the latest message, with alphabetical tie-breaking. Unread chats retain unread indicator styling without artificially shifting list order upon being clicked.

---

## Shared Architectural Weaknesses & Regression Risks
- **Weakness 1: Optimistic UI vs. Remote Storage Reference**: Passing internal storage paths to browser presentation elements instead of playable URLs.
- **Weakness 2: State Synchronization Over-reaction**: Conflating array reference equality with new message arrival.
- **Regression Risks Mitigated**:
  - Voice notes now playable locally immediately upon sending and persist stably across reloads.
  - No flickering or scroll jumps during reactions, edits, or deletes.
  - Zero horizontal overflow on mobile and desktop viewports.
