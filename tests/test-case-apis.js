require('dotenv').config();
const { app } = require('../server');
const pool = require('../src/config/db');

const TEST_PORT = 5098;

async function runTestSuite() {
  console.log('========================================================');
  console.log('      Graahak AI - Phase 3 Case APIs Test Suite        ');
  console.log('========================================================\n');

  const createdCaseIds = [];
  let server;

  try {
    // 1. Start test HTTP server
    server = await new Promise((resolve) => {
      const s = app.listen(TEST_PORT, () => {
        console.log(`[TEST] Test server listening on http://localhost:${TEST_PORT}\n`);
        resolve(s);
      });
    });

    const baseUrl = `http://localhost:${TEST_PORT}`;

    // --- TEST 1: Health Check Endpoint ---
    console.log('[Test 1] GET /api/health (Existing functionality)');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson = await healthRes.json();
    console.log(`Status: ${healthRes.status} | OK: ${healthJson.status === 'OK'}`);
    if (healthRes.status !== 200 || healthJson.status !== 'OK') {
      throw new Error('Health check endpoint failed!');
    }
    console.log('PASS: Health check operational.\n');

    // --- TEST 2: Validation Failure on POST /api/cases ---
    console.log('[Test 2] POST /api/cases with missing required fields');
    const invalidPostRes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '',
        issue_category: 'INVALID_CATEGORY',
        claimed_amount: -50,
      }),
    });
    const invalidPostJson = await invalidPostRes.json();
    console.log(`Status: ${invalidPostRes.status} (Expected: 400)`);
    console.log(`Errors caught: ${JSON.stringify(invalidPostJson.errors)}`);
    if (invalidPostRes.status !== 400 || !invalidPostJson.errors) {
      throw new Error('Expected 400 on invalid POST /api/cases');
    }
    console.log('PASS: Validation correctly rejected invalid input.\n');

    // --- TEST 3: Successful POST /api/cases ---
    console.log('[Test 3] POST /api/cases with valid data');
    const validCasePayload = {
      title: 'TEST_CASE: Defective OLED Television Panel',
      issue_category: 'DEFECTIVE_PRODUCT',
      merchant_name: 'Test Electronics Superstore Ltd',
      claimed_amount: 45000.0,
      user_narrative:
        'Purchased an OLED TV 10 days ago. The display panel turned completely black. The seller refuses to replace or refund under warranty.',
    };
    const createRes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCasePayload),
    });
    const createJson = await createRes.json();
    console.log(`Status: ${createRes.status} (Expected: 201)`);
    console.log(`Created Case ID: ${createJson.data?.id}`);
    if (createRes.status !== 201 || !createJson.data?.id) {
      throw new Error('Failed to create case with valid payload');
    }
    const createdId = createJson.data.id;
    createdCaseIds.push(createdId);
    console.log('PASS: Case created with correct status 201 and data payload.\n');

    // --- TEST 4: GET /api/cases (List & Pagination) ---
    console.log('[Test 4] GET /api/cases?page=1&limit=5');
    const listRes = await fetch(`${baseUrl}/api/cases?page=1&limit=5`);
    const listJson = await listRes.json();
    console.log(`Status: ${listRes.status} (Expected: 200)`);
    console.log(`Pagination Meta: ${JSON.stringify(listJson.meta)}`);
    console.log(`Results Returned: ${listJson.data.length}`);
    if (listRes.status !== 200 || !Array.isArray(listJson.data) || !listJson.meta) {
      throw new Error('GET /api/cases failed or missing pagination metadata');
    }
    console.log('PASS: Cases listing and pagination working.\n');

    // --- TEST 5: GET /api/cases with Filters ---
    console.log('[Test 5] GET /api/cases?issue_category=DEFECTIVE_PRODUCT&status=PENDING');
    const filterRes = await fetch(`${baseUrl}/api/cases?issue_category=DEFECTIVE_PRODUCT&status=PENDING`);
    const filterJson = await filterRes.json();
    console.log(`Status: ${filterRes.status} (Expected: 200)`);
    console.log(`Filtered Matches: ${filterJson.data.length}`);
    const foundCase = filterJson.data.find((c) => c.id === createdId);
    if (!foundCase) {
      throw new Error('Created case not found in filtered list query');
    }
    console.log('PASS: Filtering by issue_category and status working.\n');

    // --- TEST 6: GET /api/cases/:id (Valid ID) ---
    console.log(`[Test 6] GET /api/cases/${createdId} (Retrieve single case)`);
    const getSingleRes = await fetch(`${baseUrl}/api/cases/${createdId}`);
    const getSingleJson = await getSingleRes.json();
    console.log(`Status: ${getSingleRes.status} (Expected: 200)`);
    console.log(`Retrieved Title: "${getSingleJson.data?.title}"`);
    console.log(`Claimed Amount: ${getSingleJson.data?.claimed_amount}`);
    if (getSingleRes.status !== 200 || getSingleJson.data?.id !== createdId) {
      throw new Error('GET /api/cases/:id failed to retrieve the created case');
    }
    console.log('PASS: Single case retrieval verified.\n');

    // --- TEST 7: GET /api/cases/:id (Nonexistent & Invalid ID) ---
    console.log('[Test 7A] GET /api/cases/99999999 (Nonexistent ID)');
    const notFoundRes = await fetch(`${baseUrl}/api/cases/99999999`);
    console.log(`Status: ${notFoundRes.status} (Expected: 404)`);
    if (notFoundRes.status !== 404) {
      throw new Error('Expected 404 for nonexistent case ID');
    }

    console.log('[Test 7B] GET /api/cases/invalid-id-format (Invalid ID)');
    const invalidIdRes = await fetch(`${baseUrl}/api/cases/invalid-id-format`);
    console.log(`Status: ${invalidIdRes.status} (Expected: 400)`);
    if (invalidIdRes.status !== 400) {
      throw new Error('Expected 400 for invalid ID format');
    }
    console.log('PASS: Nonexistent and invalid ID error handling verified.\n');

    // --- TEST 8: PATCH /api/cases/:id (Valid Update) ---
    console.log(`[Test 8] PATCH /api/cases/${createdId} (Update status and narrative)`);
    const updatePayload = {
      status: 'ANALYZING',
      user_narrative: 'Updated narrative: Seller offered a partial credit note, but customer demands full refund.',
      claimed_amount: 47500.0,
    };
    const patchRes = await fetch(`${baseUrl}/api/cases/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });
    const patchJson = await patchRes.json();
    console.log(`Status: ${patchRes.status} (Expected: 200)`);
    console.log(`Updated Status: ${patchJson.data?.status}`);
    console.log(`Updated Amount: ${patchJson.data?.claimed_amount}`);
    if (
      patchRes.status !== 200 ||
      patchJson.data?.status !== 'ANALYZING' ||
      parseFloat(patchJson.data?.claimed_amount) !== 47500.0
    ) {
      throw new Error('PATCH /api/cases/:id failed to update fields correctly');
    }
    console.log('PASS: Partial update verified.\n');

    // --- TEST 9: PATCH /api/cases/:id (Validation & 404 checks) ---
    console.log('[Test 9A] PATCH /api/cases/99999999 with valid body (Nonexistent ID)');
    const patchNotFoundRes = await fetch(`${baseUrl}/api/cases/99999999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    console.log(`Status: ${patchNotFoundRes.status} (Expected: 404)`);
    if (patchNotFoundRes.status !== 404) {
      throw new Error('Expected 404 on PATCH for nonexistent ID');
    }

    console.log('[Test 9B] PATCH /api/cases/:id with invalid category');
    const patchInvalidRes = await fetch(`${baseUrl}/api/cases/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_category: 'NON_EXISTENT_CATEGORY' }),
    });
    console.log(`Status: ${patchInvalidRes.status} (Expected: 400)`);
    if (patchInvalidRes.status !== 400) {
      throw new Error('Expected 400 on PATCH with invalid category');
    }
    console.log('PASS: PATCH edge cases verified.\n');

    // --- Database Record Verification ---
    console.log('[Test 10] Direct MySQL Verification of Test Record');
    const [dbRows] = await pool.query('SELECT * FROM cases WHERE id = ?', [createdId]);
    console.log(`DB Row Found: ${dbRows.length === 1}`);
    console.log(`DB Title: "${dbRows[0].title}"`);
    console.log(`DB Status: ${dbRows[0].status}`);
    console.log(`DB Claimed Amount: ${dbRows[0].claimed_amount}`);
    if (dbRows.length !== 1 || dbRows[0].status !== 'ANALYZING') {
      throw new Error('Direct DB record verification failed');
    }
    console.log('PASS: Database integrity verified.\n');

    console.log('========================================================');
    console.log('         ALL 10 TEST SCENARIOS PASSED                   ');
    console.log('========================================================\n');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Clean up ONLY the test records created during this test
    if (createdCaseIds.length > 0) {
      console.log(`[CLEANUP] Cleaning up ${createdCaseIds.length} test records...`);
      for (const id of createdCaseIds) {
        await pool.query('DELETE FROM cases WHERE id = ?', [id]);
        console.log(`[CLEANUP] Deleted test case ID: ${id}`);
      }
      console.log('[CLEANUP] Test records cleaned up successfully.\n');
    }

    if (server) {
      server.close();
      console.log('[TEST] Test server stopped.');
    }
    await pool.end();
  }
}

runTestSuite();
