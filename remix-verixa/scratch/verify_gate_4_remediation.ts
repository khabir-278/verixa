import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://jnbaumemwxydjktwedtz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

const USER_A_EMAIL = 'test_doc_user@verixa.com';
const USER_A_PASS = 'VerixaDoc#abase.co';
const USER_A_ID = 'c7aa8500-26f1-4c6f-ac9d-deaf95373544';

const USER_B_EMAIL = 'qa_user_b@verixa.internal';
const USER_B_PASS = 'VerixaQA#2026PeerSecure';
const USER_B_ID = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';

interface VerificationResult {
  testId: string;
  description: string;
  actor: string;
  targetPath: string;
  actualResponse: any;
  expectedOutcome: string;
  passed: boolean;
  unexpectedSuccess: boolean;
  notes: string;
}

const results: VerificationResult[] = [];

async function runVerification() {
  console.log('========================================================');
  console.log('   POST-REMEDIATION VERIFICATION SUITE: V-STOR-01..06   ');
  console.log('========================================================\n');

  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const authA = await clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASS });
  if (authA.error || !authA.data.user) throw new Error(`User A login failed: ${authA.error?.message}`);
  console.log(`✓ User A authenticated: ${authA.data.user.id}`);

  const clientB = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const authB = await clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: USER_B_PASS });
  if (authB.error || !authB.data.user) throw new Error(`User B login failed: ${authB.error?.message}`);
  console.log(`✓ User B authenticated: ${authB.data.user.id}`);

  const clientAnon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  console.log(`✓ Anonymous client initialized\n`);

  const ownerPath = `${USER_A_ID}/posts/v_test_owner.txt`;
  const crossPath = `${USER_B_ID}/posts/v_test_cross.txt`;
  const anonPath = `${USER_A_ID}/posts/v_test_anon.txt`;
  const testBuffer = Buffer.from('[VERIXA-QA] Post-remediation verification probe.');

  // --------------------------------------------------------------------------
  // V-STOR-01: User A upload to User A folder (MUST SUCCEED)
  // --------------------------------------------------------------------------
  console.log('--- Executing V-STOR-01: Positive Same-User Upload ---');
  const res1 = await clientA.storage.from('app-files').upload(ownerPath, testBuffer, {
    contentType: 'text/plain',
    upsert: false,
  });
  const pass1 = !res1.error && !!res1.data?.path;
  console.log('V-STOR-01 Result:', { data: res1.data, error: res1.error?.message, pass: pass1 });

  results.push({
    testId: 'V-STOR-01',
    description: 'User A upload to User A folder',
    actor: 'User A (@doc_auditor)',
    targetPath: ownerPath,
    actualResponse: { data: res1.data, error: res1.error?.message },
    expectedOutcome: 'Upload succeeds (error: null)',
    passed: pass1,
    unexpectedSuccess: false,
    notes: pass1 ? 'Legitimate owner upload succeeded as expected.' : `Failed: ${res1.error?.message}`,
  });

  if (!pass1) {
    console.error('❌ V-STOR-01 FAILED! Legitimate upload was blocked.');
  }

  // --------------------------------------------------------------------------
  // V-STOR-02: User A upload to User B folder (MUST FAIL)
  // --------------------------------------------------------------------------
  console.log('\n--- Executing V-STOR-02: Cross-User Upload Attempt ---');
  const res2 = await clientA.storage.from('app-files').upload(crossPath, testBuffer, {
    contentType: 'text/plain',
    upsert: false,
  });
  const unexpectedSuccess2 = !res2.error && !!res2.data?.path;
  const pass2 = !!res2.error;
  console.log('V-STOR-02 Result:', { data: res2.data, error: res2.error?.message, pass: pass2 });

  results.push({
    testId: 'V-STOR-02',
    description: 'User A upload to User B folder',
    actor: 'User A (@doc_auditor)',
    targetPath: crossPath,
    actualResponse: { data: res2.data, error: res2.error?.message },
    expectedOutcome: 'Upload rejected by RLS policy',
    passed: pass2,
    unexpectedSuccess: unexpectedSuccess2,
    notes: pass2
      ? `Cross-user upload successfully blocked (${res2.error?.message}).`
      : 'CRITICAL: Cross-user upload unexpectedly succeeded! Remediation policy not active.',
  });

  if (unexpectedSuccess2) {
    console.error('🚨 CRITICAL V-STOR-02 FAILED: Cross-user upload unexpectedly SUCCEEDED!');
    // Clean up cross file immediately if created
    await clientA.storage.from('app-files').remove([crossPath]);
    await clientB.storage.from('app-files').remove([crossPath]);
  }

  // --------------------------------------------------------------------------
  // V-STOR-03: Cross-user overwrite attempt (MUST FAIL)
  // --------------------------------------------------------------------------
  console.log('\n--- Executing V-STOR-03: Cross-User Overwrite Attempt ---');
  const res3 = await clientA.storage.from('app-files').upload(crossPath, testBuffer, {
    contentType: 'text/plain',
    upsert: true,
  });
  const unexpectedSuccess3 = !res3.error && !!res3.data?.path;
  const pass3 = !!res3.error;
  console.log('V-STOR-03 Result:', { data: res3.data, error: res3.error?.message, pass: pass3 });

  results.push({
    testId: 'V-STOR-03',
    description: 'Cross-user overwrite attempt (upsert: true)',
    actor: 'User A (@doc_auditor)',
    targetPath: crossPath,
    actualResponse: { data: res3.data, error: res3.error?.message },
    expectedOutcome: 'Overwrite rejected by RLS policy',
    passed: pass3,
    unexpectedSuccess: unexpectedSuccess3,
    notes: pass3
      ? `Cross-user overwrite successfully blocked (${res3.error?.message}).`
      : 'CRITICAL: Cross-user overwrite unexpectedly succeeded!',
  });

  if (unexpectedSuccess3) {
    console.error('🚨 CRITICAL V-STOR-03 FAILED: Cross-user overwrite unexpectedly SUCCEEDED!');
    await clientA.storage.from('app-files').remove([crossPath]);
    await clientB.storage.from('app-files').remove([crossPath]);
  }

  // --------------------------------------------------------------------------
  // V-STOR-04: User B deletion of User A object (MUST FAIL or affect 0 objects)
  // --------------------------------------------------------------------------
  console.log('\n--- Executing V-STOR-04: Cross-User Deletion Attempt ---');
  const res4 = await clientB.storage.from('app-files').remove([ownerPath]);
  // In Supabase Storage, if RLS prevents delete, remove() returns data: [] (0 rows deleted)
  const deletedRowsCount = res4.data?.length ?? 0;
  // Verify User A's file still exists
  const checkOwnerRes = await clientA.storage.from('app-files').list(`${USER_A_ID}/posts`);
  const fileStillExists = checkOwnerRes.data?.some((o) => o.name === 'v_test_owner.txt') ?? false;
  const pass4 = deletedRowsCount === 0 && fileStillExists;
  console.log('V-STOR-04 Result:', {
    removeReturn: res4.data,
    deletedRowsCount,
    fileStillExists,
    pass: pass4,
  });

  results.push({
    testId: 'V-STOR-04',
    description: 'User B deletion of User A object',
    actor: 'User B (@qa_user_b)',
    targetPath: ownerPath,
    actualResponse: { removeData: res4.data, fileStillExists, error: res4.error?.message },
    expectedOutcome: 'Deletion rejected or affects 0 objects; User A file preserved',
    passed: pass4,
    unexpectedSuccess: !pass4,
    notes: pass4
      ? 'Cross-user deletion successfully prevented. User A object intact.'
      : 'CRITICAL: User B was able to delete User A object!',
  });

  // --------------------------------------------------------------------------
  // V-STOR-05: Anonymous upload attempt (MUST FAIL)
  // --------------------------------------------------------------------------
  console.log('\n--- Executing V-STOR-05: Anonymous Upload Attempt ---');
  const res5 = await clientAnon.storage.from('app-files').upload(anonPath, testBuffer, {
    contentType: 'text/plain',
    upsert: false,
  });
  const unexpectedSuccess5 = !res5.error && !!res5.data?.path;
  const pass5 = !!res5.error;
  console.log('V-STOR-05 Result:', { data: res5.data, error: res5.error?.message, pass: pass5 });

  results.push({
    testId: 'V-STOR-05',
    description: 'Anonymous unauthenticated upload attempt',
    actor: 'Anonymous Client',
    targetPath: anonPath,
    actualResponse: { data: res5.data, error: res5.error?.message },
    expectedOutcome: 'Upload rejected with Unauthorized / RLS error',
    passed: pass5,
    unexpectedSuccess: unexpectedSuccess5,
    notes: pass5
      ? `Unauthenticated upload successfully rejected (${res5.error?.message}).`
      : 'CRITICAL: Anonymous upload unexpectedly succeeded!',
  });

  if (unexpectedSuccess5) {
    await clientA.storage.from('app-files').remove([anonPath]);
  }

  // --------------------------------------------------------------------------
  // V-STOR-06: Cleanup and verify zero QA remediation objects remain
  // --------------------------------------------------------------------------
  console.log('\n--- Executing V-STOR-06: Cleanup & Zero-Object Verification ---');
  const cleanRes = await clientA.storage.from('app-files').remove([ownerPath]);
  console.log('Clean Owner File Result:', cleanRes.data);

  const listA = await clientA.storage.from('app-files').list(`${USER_A_ID}/posts`);
  const listB = await clientB.storage.from('app-files').list(`${USER_B_ID}/posts`);
  const listRoot = await clientA.storage.from('app-files').list();

  const rootFiles = (listRoot.data || []).filter((item) => item.id !== null || item.metadata !== null);
  const countA = listA.data?.length ?? 0;
  const countB = listB.data?.length ?? 0;
  const countRoot = rootFiles.length;
  const totalResidual = countA + countB + countRoot;
  const pass6 = totalResidual === 0;

  console.log('V-STOR-06 Verification:', {
    userAPosts: countA,
    userBPosts: countB,
    rootItems: countRoot,
    totalResidual,
    pass: pass6,
  });

  results.push({
    testId: 'V-STOR-06',
    description: 'Cleanup and zero-residual-object verification',
    actor: 'User A (@doc_auditor)',
    targetPath: 'All QA folders',
    actualResponse: { countA, countB, countRoot, totalResidual },
    expectedOutcome: 'Exactly 0 residual objects remain',
    passed: pass6,
    unexpectedSuccess: false,
    notes: pass6 ? 'Verified: Exactly 0 residual objects remain in storage.' : `Residual objects detected: ${totalResidual}`,
  });

  const outPath = path.join('c:', 'remix-verixa', 'VERIXA_QA_AUDIT', 'remediation_verification_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n✓ Results written to ${outPath}`);

  const allPassed = results.every((r) => r.passed);
  console.log(`\nOverall Verification Suite: ${allPassed ? 'ALL TESTS PASSED' : 'TESTS FAILED'}`);
  return { allPassed, results };
}

runVerification().catch(console.error);
