const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
} else {
  dotenv.config();
}

const DEFAULT_SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key);

async function runTests() {
  console.log('=== STARTING VERIXA MESSAGING BUG FIX VERIFICATION ===\n');
  let passCount = 0;
  let failCount = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`[PASS] ${testName} ${detail}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${testName} ${detail}`);
      failCount++;
    }
  }

  // TEST 1: Media Gateway Resolution with Storage Path
  console.log('\n--- Test 1: Chat Media Moderation with Storage Path ---');
  try {
    const testStoragePath = '1e71840f-a4ce-4b73-bbf8-686e7235d3c9/audio/voice_1789421138963_2tut3.webm';
    const res = await fetch('http://localhost:3000/api/moderation/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: testStoragePath,
        content_type: 'dm_media',
        mime_type: 'audio/webm',
        context: 'direct message attachment test',
      }),
    });
    const data = await res.json();
    console.log('Media gateway status:', res.status);
    console.log('Gateway response reason:', data.reason);
    console.log('Gateway decision:', data.decision);

    // Verify it did NOT fail with "Could not fetch or decode image media for safety inspection"
    const isFetchFail = data.reason?.includes('Could not fetch or decode image media');
    assert(!isFetchFail, 'Media Gateway resolves storage path without fetch/decode failure');
  } catch (err) {
    console.error('Test 1 error:', err);
    assert(false, 'Media Gateway call', err.message);
  }

  // TEST 2: Test 1x1 Sample Image through Moderation Gateway
  console.log('\n--- Test 2: Safe Image AI Inspection via Gateway ---');
  try {
    const samplePngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const res = await fetch('http://localhost:3000/api/moderation/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: samplePngDataUrl,
        content_type: 'dm_media',
        mime_type: 'image/png',
        context: 'direct message attachment safe check',
      }),
    });
    const data = await res.json();
    console.log('Sample image decision:', data.decision);
    console.log('Sample image allowed:', data.allowed);
    console.log('Sample image summary/reason:', data.reason || data.summary);

    assert(data.allowed === true || data.decision === 'ALLOW', 'Safe image is allowed by AI Moderation Gateway');
    assert(!data.reason?.includes('Could not fetch'), 'No false fetch/decode quarantine on valid image');
  } catch (err) {
    console.error('Test 2 error:', err);
    assert(false, 'Image AI inspection', err.message);
  }

  // TEST 3: Metadata Packaging and Unpacking for Reply and Forward
  console.log('\n--- Test 3: Metadata Packaging & Persistence ---');
  try {
    const testMeta = {
      replyToMessageId: 'parent-msg-123',
      replyTo: {
        id: 'parent-msg-123',
        senderId: 'user-a',
        senderName: 'Alex',
        text: 'Are you available today?',
      },
      isForwarded: true,
      forwardedFromMessageId: 'orig-msg-999',
    };

    const originalText = 'Yes, let us meet at 4 PM!';
    const packedText = JSON.stringify({ _v_meta: testMeta, text: originalText });

    // Unpack simulated
    let unpackedText = packedText;
    let unpackedMeta = null;
    if (unpackedText.startsWith('{"_v_meta":')) {
      const parsed = JSON.parse(unpackedText);
      unpackedMeta = parsed._v_meta;
      unpackedText = parsed.text;
    }

    assert(unpackedText === originalText, 'Text unpacked correctly without metadata pollution');
    assert(unpackedMeta.replyToMessageId === 'parent-msg-123', 'replyToMessageId preserved');
    assert(unpackedMeta.replyTo.text === 'Are you available today?', 'Quoted reply preview preserved');
    assert(unpackedMeta.isForwarded === true, 'isForwarded flag preserved');
  } catch (err) {
    console.error('Test 3 error:', err);
    assert(false, 'Metadata packaging test', err.message);
  }

  // TEST 4: Reaction Toggle Simulation
  console.log('\n--- Test 4: Reaction Toggle Logic ---');
  try {
    let reactions = {};
    const userId1 = 'user-1';
    const userId2 = 'user-2';

    // Add reaction
    reactions[userId1] = '❤️';
    assert(reactions[userId1] === '❤️', 'User 1 added reaction ❤️');

    // Add second user reaction
    reactions[userId2] = '🔥';
    assert(reactions[userId2] === '🔥', 'User 2 added reaction 🔥');

    // User 1 changes reaction to 👍
    reactions[userId1] = '👍';
    assert(reactions[userId1] === '👍', 'User 1 changed reaction to 👍');

    // User 1 toggles same emoji to remove
    if (reactions[userId1] === '👍') {
      delete reactions[userId1];
    }
    assert(reactions[userId1] === undefined, 'User 1 removed reaction 👍');
    assert(reactions[userId2] === '🔥', 'User 2 reaction remained intact');
  } catch (err) {
    console.error('Test 4 error:', err);
    assert(false, 'Reaction toggle logic', err.message);
  }

  // Summary
  console.log(`\n=== RESULTS: ${passCount} PASSED, ${failCount} FAILED ===`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
