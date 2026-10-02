async function testReviewEndpoints() {
  const repRes = await fetch('http://localhost:3000/api/moderation/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reporterId: '9cd3413e-94ae-4bc8-b64d-ba42c21599be',
      targetId: 'qa_post_04_test_id',
      targetType: 'post',
      reason: 'HARASSMENT',
      description: '[VERIXA-QA] Dry-run report test',
    }),
  });
  console.log('Report test res:', await repRes.json());
}

testReviewEndpoints();
