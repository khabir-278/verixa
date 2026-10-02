async function testMod() {
  const safeRes = await fetch('http://localhost:3000/api/moderate/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: '[VERIXA-QA] Baseline clean text for audit verification.' }),
  });
  console.log('Safe text response:', await safeRes.json());

  const toxicRes = await fetch('http://localhost:3000/api/moderate/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: '[VERIXA-QA] [TEST-BLOCK] You are completely worthless and should go kill yourself right now.' }),
  });
  console.log('Toxic text response:', await toxicRes.json());
}

testMod();
