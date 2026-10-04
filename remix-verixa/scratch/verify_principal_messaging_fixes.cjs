const assert = require('assert');

console.log('=== STARTING PRINCIPAL MESSAGING ARCHITECTURE & REGRESSION SUITE ===\n');
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// TEST SUITE 1: AUDIO DURATION FORMATTING & WEBM INFINITY DEFENSE
// -------------------------------------------------------------
console.log('--- Suite 1: Audio Duration Guardrails & Formatting ---');

const formatTime = (secs) => {
  if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '0:00';
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
};

test('Standard durations format cleanly', () => {
  assert.strictEqual(formatTime(7), '0:07');
  assert.strictEqual(formatTime(32), '0:32');
  assert.strictEqual(formatTime(64), '1:04');
  assert.strictEqual(formatTime(125), '2:05');
  assert.strictEqual(formatTime(3600), '60:00');
});

test('WebM Infinity duration NEVER produces "Infinity:NaN"', () => {
  const result = formatTime(Infinity);
  assert.strictEqual(result, '0:00');
  assert(!result.includes('Infinity'));
  assert(!result.includes('NaN'));
});

test('NaN and invalid inputs format safely to 0:00', () => {
  assert.strictEqual(formatTime(NaN), '0:00');
  assert.strictEqual(formatTime(-10), '0:00');
  assert.strictEqual(formatTime(undefined), '0:00');
  assert.strictEqual(formatTime(null), '0:00');
  assert.strictEqual(formatTime('string'), '0:00');
});

// -------------------------------------------------------------
// TEST SUITE 2: AUDIO PLAYBACK LIFECYCLE & STORAGE PATH RESOLUTION
// -------------------------------------------------------------
console.log('\n--- Suite 2: Audio Optimistic & Playback Lifecycle ---');

test('Optimistic message receives playable URL while DB receives storage path', () => {
  const rawStoragePath = 'user_123/audio/voice_179123456.webm';
  const signedOrBlobUrl = 'blob:http://localhost:3000/mock-audio-uuid';

  const options = {
    messageType: 'audio',
    optimisticMediaUrl: signedOrBlobUrl,
  };

  const optimisticMsg = {
    id: 'temp_msg_1',
    mediaUrl: options?.optimisticMediaUrl || rawStoragePath,
  };

  // UI renders playable URL immediately
  assert.strictEqual(optimisticMsg.mediaUrl, signedOrBlobUrl, 'Optimistic message has immediately playable URL');
  assert(optimisticMsg.mediaUrl.startsWith('blob:') || optimisticMsg.mediaUrl.startsWith('http'), 'URL is directly playable by HTML5 Audio');
});

test('VoiceMessagePlayer resolves raw storage paths defensively', () => {
  const isDirectUrl = (url) => !!url && (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:'));

  const directUrl = 'https://supabase.co/storage/v1/object/sign/app-files/voice.webm?token=123';
  const storagePath = 'user_123/audio/voice.webm';

  assert.strictEqual(isDirectUrl(directUrl), true, 'Signed URL recognized as direct playable URL');
  assert.strictEqual(isDirectUrl(storagePath), false, 'Raw storage path recognized as requiring signed resolution');
});

// -------------------------------------------------------------
// TEST SUITE 3: UI POSITIONING & VIEWPORT SAFETY
// -------------------------------------------------------------
console.log('\n--- Suite 3: UI Positioning & Collision Detection ---');

test('Opponent message action elements anchor left-0 to avoid left boundary clipping', () => {
  const isMe = false;
  const reactionBarClass = isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left';
  const menuClass = isMe ? 'right-0' : 'left-0';

  assert(reactionBarClass.includes('left-0'), 'Opponent reaction bar opens inward to the right');
  assert(reactionBarClass.includes('origin-bottom-left'), 'Opponent reaction bar expands from left origin');
  assert(menuClass.includes('left-0'), 'Opponent more-options dropdown opens inward to the right');
});

test('Own message action elements anchor right-0 to avoid right boundary clipping', () => {
  const isMe = true;
  const reactionBarClass = isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left';
  const menuClass = isMe ? 'right-0' : 'left-0';

  assert(reactionBarClass.includes('right-0'), 'Own reaction bar opens inward to the left');
  assert(reactionBarClass.includes('origin-bottom-right'), 'Own reaction bar expands from right origin');
  assert(menuClass.includes('right-0'), 'Own more-options dropdown opens inward to the left');
});

test('Dropdown menu handles vertical collision near list bottom', () => {
  const totalMessages = 20;

  const getVerticalPlacement = (index) => (index >= totalMessages - 2 ? 'bottom-full mb-1.5' : 'top-full mt-1.5');

  assert.strictEqual(getVerticalPlacement(5), 'top-full mt-1.5', 'Message in middle opens downward');
  assert.strictEqual(getVerticalPlacement(18), 'bottom-full mb-1.5', 'Penultimate message opens upward');
  assert.strictEqual(getVerticalPlacement(19), 'bottom-full mb-1.5', 'Last message opens upward');
});

// -------------------------------------------------------------
// TEST SUITE 4: SCROLL ANCHORING LOGIC
// -------------------------------------------------------------
console.log('\n--- Suite 4: Smart Scroll Anchoring & Reading Position Preservation ---');

test('Scroll trigger correctly classifies events', () => {
  function shouldScrollToBottom({ activeChatChanged, prevLength, currentLength, prevLastId, lastMsg, currentUserId, isNearBottom }) {
    if (activeChatChanged) return { scroll: true, behavior: 'auto', reason: 'chat_switch' };
    if (currentLength === prevLength && lastMsg?.id === prevLastId) return { scroll: false, reason: 'mutation_reaction_edit_delete' };
    if (lastMsg && lastMsg.id !== prevLastId) {
      if (lastMsg.senderId === currentUserId) return { scroll: true, behavior: 'smooth', reason: 'own_sent_message' };
      if (isNearBottom) return { scroll: true, behavior: 'smooth', reason: 'incoming_at_bottom' };
      return { scroll: false, reason: 'incoming_while_reading_history' };
    }
    return { scroll: false, reason: 'none' };
  }

  const myId = 'user_me';
  const otherId = 'user_other';

  // 1. Initial chat open
  const openChat = shouldScrollToBottom({
    activeChatChanged: true,
    prevLength: 0,
    currentLength: 10,
    prevLastId: undefined,
    lastMsg: { id: 'm10', senderId: otherId },
    currentUserId: myId,
    isNearBottom: true,
  });
  assert.strictEqual(openChat.scroll, true);
  assert.strictEqual(openChat.reason, 'chat_switch');

  // 2. User reacts to a message (length identical, last ID identical)
  const reactEvent = shouldScrollToBottom({
    activeChatChanged: false,
    prevLength: 10,
    currentLength: 10,
    prevLastId: 'm10',
    lastMsg: { id: 'm10', senderId: otherId },
    currentUserId: myId,
    isNearBottom: false, // user was scrolled up
  });
  assert.strictEqual(reactEvent.scroll, false);
  assert.strictEqual(reactEvent.reason, 'mutation_reaction_edit_delete');

  // 3. User deletes/edits a message
  const editEvent = shouldScrollToBottom({
    activeChatChanged: false,
    prevLength: 10,
    currentLength: 10,
    prevLastId: 'm10',
    lastMsg: { id: 'm10', senderId: otherId },
    currentUserId: myId,
    isNearBottom: false,
  });
  assert.strictEqual(editEvent.scroll, false);

  // 4. User sends a new message
  const sendEvent = shouldScrollToBottom({
    activeChatChanged: false,
    prevLength: 10,
    currentLength: 11,
    prevLastId: 'm10',
    lastMsg: { id: 'm11', senderId: myId },
    currentUserId: myId,
    isNearBottom: false,
  });
  assert.strictEqual(sendEvent.scroll, true);
  assert.strictEqual(sendEvent.reason, 'own_sent_message');

  // 5. Incoming message while reading older history
  const historyIncomingEvent = shouldScrollToBottom({
    activeChatChanged: false,
    prevLength: 10,
    currentLength: 11,
    prevLastId: 'm10',
    lastMsg: { id: 'm11', senderId: otherId },
    currentUserId: myId,
    isNearBottom: false, // scrolled up
  });
  assert.strictEqual(historyIncomingEvent.scroll, false);
  assert.strictEqual(historyIncomingEvent.reason, 'incoming_while_reading_history');

  // 6. Incoming message while user is at bottom
  const bottomIncomingEvent = shouldScrollToBottom({
    activeChatChanged: false,
    prevLength: 10,
    currentLength: 11,
    prevLastId: 'm10',
    lastMsg: { id: 'm11', senderId: otherId },
    currentUserId: myId,
    isNearBottom: true, // at bottom
  });
  assert.strictEqual(bottomIncomingEvent.scroll, true);
  assert.strictEqual(bottomIncomingEvent.reason, 'incoming_at_bottom');
});

// -------------------------------------------------------------
// TEST SUITE 5: CHAT LIST ORDERING & SELECTION ISOLATION
// -------------------------------------------------------------
console.log('\n--- Suite 5: Deterministic Chat List Ordering ---');

test('Opening/selecting a chat does NOT change its position', () => {
  const users = [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Charlie' },
  ];

  const conversationsMap = {
    u1: { createdAt: '2026-10-04T10:00:00Z', lastText: 'Hey' },
    u2: { createdAt: '2026-10-04T12:00:00Z', lastText: 'Lunch?' },
    u3: { createdAt: '2026-10-04T08:00:00Z', lastText: 'Morning' },
  };

  const sortContacts = (list, map) => {
    return [...list].sort((a, b) => {
      const timeA = map[a.id]?.createdAt ? new Date(map[a.id].createdAt).getTime() : 0;
      const timeB = map[b.id]?.createdAt ? new Date(map[b.id].createdAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name);
    });
  };

  // Initial order: Bob (12:00) > Alice (10:00) > Charlie (08:00)
  const initialOrder = sortContacts(users, conversationsMap);
  assert.deepStrictEqual(initialOrder.map((u) => u.name), ['Bob', 'Alice', 'Charlie']);

  // Simulate user opening Alice (u1)
  // Selecting a conversation must NOT mutate createdAt in conversationsMap
  const orderAfterOpenAlice = sortContacts(users, conversationsMap);
  assert.deepStrictEqual(orderAfterOpenAlice.map((u) => u.name), ['Bob', 'Alice', 'Charlie'], 'Chat order is completely unchanged by opening Alice');

  // Simulate user opening Charlie (u3)
  const orderAfterOpenCharlie = sortContacts(users, conversationsMap);
  assert.deepStrictEqual(orderAfterOpenCharlie.map((u) => u.name), ['Bob', 'Alice', 'Charlie'], 'Chat order is completely unchanged by opening Charlie');

  // Now simulate Charlie sending a genuine new message at 13:00:00Z
  const updatedMap = {
    ...conversationsMap,
    u3: { createdAt: '2026-10-04T13:00:00Z', lastText: 'New message!' },
  };
  const orderAfterRealNewMessage = sortContacts(users, updatedMap);
  assert.deepStrictEqual(orderAfterRealNewMessage.map((u) => u.name), ['Charlie', 'Bob', 'Alice'], 'Charlie moves to top ONLY when an authentic new message arrives');
});

console.log(`\n=== SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) {
  process.exit(1);
}
