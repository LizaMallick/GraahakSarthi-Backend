require('dotenv').config();
const { app } = require('../server');
const pool = require('../src/config/db');

const TEST_PORT = 5093;

async function runPhase6LossCalculatorTests() {
  console.log('========================================================');
  console.log('   Graahak AI - Phase 6 Loss Calculator Test Suite      ');
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

    // --- SETUP: Create Case A (claimed_amount: 50000.00) ---
    console.log('[Setup] Creating Case A (claimed_amount: 50000.00)...');
    const caseARes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_A: Defective Television',
        issue_category: 'DEFECTIVE_PRODUCT',
        merchant_name: 'ElectroDirect Retail',
        claimed_amount: 50000.0,
        user_narrative: 'Panel burned out after 5 days.',
      }),
    });
    const caseAJson = await caseARes.json();
    const caseAId = String(caseAJson.data.id);
    createdCaseIds.push(caseAId);
    console.log(`[Setup] Case A created with ID: ${caseAId}`);

    // --- SETUP: Create Case B for isolation checks (claimed_amount: 15000.00) ---
    console.log('[Setup] Creating Case B for route isolation checks...');
    const caseBRes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_B: Flight Delay',
        issue_category: 'DEFICIENCY_IN_SERVICE',
        merchant_name: 'FastAir Ltd',
        claimed_amount: 15000.0,
        user_narrative: 'Flight delayed 12 hours.',
      }),
    });
    const caseBJson = await caseBRes.json();
    const caseBId = String(caseBJson.data.id);
    createdCaseIds.push(caseBId);
    console.log(`[Setup] Case B created with ID: ${caseBId}\n`);

    // --- TEST 1: Baseline GET (No saved calculation exists) ---
    console.log('[Test 1] Baseline GET on Case A before any calculation is saved');
    const baselineRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss`);
    const baselineJson = await baselineRes.json();
    console.log(`Baseline Status: ${baselineRes.status} (Expected: 200)`);
    console.log(`Baseline ID: ${baselineJson.data?.id} (Expected: null)`);
    console.log(`Is Baseline: ${baselineJson.data?.is_baseline} (Expected: true)`);
    console.log(`Created At: ${baselineJson.data?.created_at} (Expected: null)`);
    console.log(`Gross Loss: ${baselineJson.data?.gross_loss} (Expected: 50000)`);

    if (
      baselineRes.status !== 200 ||
      baselineJson.data?.id !== null ||
      baselineJson.data?.is_baseline !== true ||
      baselineJson.data?.created_at !== null ||
      baselineJson.data?.gross_loss !== 50000
    ) {
      throw new Error('Baseline GET validation failed');
    }

    // Verify nothing was silently persisted in DB
    const [dbBaselineRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM case_loss_calculations WHERE case_id = ?',
      [caseAId]
    );
    console.log(`Database rows after baseline GET: ${dbBaselineRows[0].count} (Expected: 0)`);
    if (dbBaselineRows[0].count !== 0) {
      throw new Error('Baseline GET silently persisted a record into the database!');
    }
    console.log('PASS: Baseline GET returns derived values without silent persistence.\n');

    // --- TEST 2: Validation Failures (400 Bad Request) ---
    console.log('[Test 2A] Reject negative monetary values');
    const negRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_amount: -500 }),
    });
    console.log(`Status: ${negRes.status} (Expected: 400)`);
    if (negRes.status !== 400) throw new Error('Failed to reject negative purchase_amount');

    console.log('[Test 2B] Reject excessive interest rate (> 36%)');
    const rateRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest: { annual_rate: 45.0 } }),
    });
    console.log(`Status: ${rateRes.status} (Expected: 400)`);
    if (rateRes.status !== 400) throw new Error('Failed to reject interest rate > 36%');

    console.log('[Test 2C] Reject interest start_date > end_date');
    const dateRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interest: {
          annual_rate: 9.0,
          start_date: '2024-12-01',
          end_date: '2024-01-01',
        },
      }),
    });
    console.log(`Status: ${dateRes.status} (Expected: 400)`);
    if (dateRes.status !== 400) throw new Error('Failed to reject start_date > end_date');

    console.log('[Test 2D] Reject unexpected request body fields');
    const rogueRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unapproved_field: 'malicious_input' }),
    });
    console.log(`Status: ${rogueRes.status} (Expected: 400)`);
    if (rogueRes.status !== 400) throw new Error('Failed to reject unexpected body field');
    console.log('PASS: Input validation rejected all invalid scenarios.\n');

    // --- TEST 3: Nonexistent Case ID (404 Not Found) ---
    console.log('[Test 3] Nonexistent case ID error handling (404)');
    const notFoundRes = await fetch(`${baseUrl}/api/cases/99999999/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_amount: 1000 }),
    });
    console.log(`Status: ${notFoundRes.status} (Expected: 404)`);
    if (notFoundRes.status !== 404) throw new Error('Expected 404 for nonexistent case ID');
    console.log('PASS: Nonexistent case correctly returned 404.\n');

    // --- TEST 4: Fallback to claimed_amount vs Explicit purchase_amount ---
    console.log('[Test 4A] Calculation using fallback claimed_amount (purchase_amount omitted)');
    const calcFallbackRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delivery_installation_charges: 1200.0,
        refunds_received: 2000.0,
      }),
    });
    const calcFallbackJson = await calcFallbackRes.json();
    console.log(`Status: ${calcFallbackRes.status} (Expected: 201)`);
    console.log(`Purchase Amount Used: ${calcFallbackJson.data?.itemized_breakdown?.purchase_amount} (Expected: 50000)`);
    console.log(`Gross Loss: ${calcFallbackJson.data?.gross_loss} (Expected: 51200)`);
    console.log(`Net Loss: ${calcFallbackJson.data?.net_loss} (Expected: 49200)`);

    if (
      calcFallbackRes.status !== 201 ||
      calcFallbackJson.data?.itemized_breakdown?.purchase_amount !== 50000 ||
      calcFallbackJson.data?.gross_loss !== 51200 ||
      calcFallbackJson.data?.net_loss !== 49200
    ) {
      throw new Error('Fallback claimed_amount calculation failed');
    }

    console.log('[Test 4B] Calculation with EXPLICIT purchase_amount (must NOT add claimed_amount)');
    const calcExplicitRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_amount: 25000.0,
        delivery_installation_charges: 500.0,
        repair_replacement_expenses: 1500.0,
        travel_communication_expenses: 400.0,
        other_documented_expenses: 100.0,
        refunds_received: 1000.0,
      }),
    });
    const calcExplicitJson = await calcExplicitRes.json();
    console.log(`Status: ${calcExplicitRes.status} (Expected: 201)`);
    console.log(`Explicit Purchase: ${calcExplicitJson.data?.itemized_breakdown?.purchase_amount} (Expected: 25000)`);
    console.log(`Gross Loss: ${calcExplicitJson.data?.gross_loss} (Expected: 27500)`);
    console.log(`Net Loss: ${calcExplicitJson.data?.net_loss} (Expected: 26500)`);

    if (
      calcExplicitRes.status !== 201 ||
      calcExplicitJson.data?.itemized_breakdown?.purchase_amount !== 25000 ||
      calcExplicitJson.data?.gross_loss !== 27500 ||
      calcExplicitJson.data?.net_loss !== 26500
    ) {
      throw new Error('Explicit purchase_amount calculation failed');
    }
    console.log('PASS: Fallback vs explicit purchase amount semantics verified.\n');

    // --- TEST 5: Simple Interest Calculation & Decimal Precision ---
    console.log('[Test 5] Calculation with 9.0% simple interest over exact 245 days');
    const calcInterestRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_amount: 63950.0,
        refunds_received: 0,
        interest: {
          annual_rate: 9.0,
          start_date: '2024-03-01',
          end_date: '2024-11-01', // exactly 245 days
        },
      }),
    });
    const calcInterestJson = await calcInterestRes.json();
    console.log(`Status: ${calcInterestRes.status} (Expected: 201)`);
    console.log(`Net Loss: ${calcInterestJson.data?.net_loss} (Expected: 63950)`);
    console.log(`Interest Days: ${calcInterestJson.data?.interest_estimate?.days} (Expected: 245)`);
    console.log(`Estimated Interest: ${calcInterestJson.data?.interest_estimate?.estimated_interest} (Expected: 3863.28)`);
    console.log(`Total Claim: ${calcInterestJson.data?.total_estimated_claim} (Expected: 67813.28)`);

    // 63950 * 0.09 * (245/365) = 3863.28082... -> 3863.28
    if (
      calcInterestRes.status !== 201 ||
      calcInterestJson.data?.interest_estimate?.days !== 245 ||
      calcInterestJson.data?.interest_estimate?.estimated_interest !== 3863.28 ||
      calcInterestJson.data?.total_estimated_claim !== 67813.28
    ) {
      throw new Error('Simple interest decimal calculation failed precision test');
    }
    console.log('PASS: Decimal-safe simple interest calculation verified.\n');

    // --- TEST 6: Refunds Exceeding Gross Documented Loss (Floor at 0.00) ---
    console.log('[Test 6] Refunds greater than expenses must floor net_loss at 0.00');
    const calcExcessRefundRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_amount: 5000.0,
        refunds_received: 8000.0,
      }),
    });
    const calcExcessJson = await calcExcessRefundRes.json();
    console.log(`Status: ${calcExcessRefundRes.status} (Expected: 201)`);
    console.log(`Gross Loss: ${calcExcessJson.data?.gross_loss} (Expected: 5000)`);
    console.log(`Refunds Received: ${calcExcessJson.data?.refunds_received} (Expected: 8000)`);
    console.log(`Net Loss: ${calcExcessJson.data?.net_loss} (Expected: 0)`);
    console.log(`Total Claim: ${calcExcessJson.data?.total_estimated_claim} (Expected: 0)`);

    if (calcExcessJson.data?.net_loss !== 0 || calcExcessJson.data?.total_estimated_claim !== 0) {
      throw new Error('Net loss failed to floor at 0.00 when refunds exceeded expenses');
    }
    console.log('PASS: Net loss safely floored at 0.00 without negative numbers.\n');

    // --- TEST 7: GET /api/cases/:id/loss and GET /api/cases/:id/loss/history ---
    console.log('[Test 7A] GET /api/cases/:id/loss returns latest saved snapshot');
    const getLatestRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss`);
    const getLatestJson = await getLatestRes.json();
    console.log(`Latest Snapshot ID: ${getLatestJson.data?.id}`);
    console.log(`Gross Loss: ${getLatestJson.data?.gross_loss} (Expected: 5000)`);
    console.log(`Disclaimer present: ${Boolean(getLatestJson.data?.disclaimer)}`);

    if (getLatestRes.status !== 200 || !getLatestJson.data?.id || !getLatestJson.data?.disclaimer) {
      throw new Error('Failed to retrieve latest saved loss snapshot');
    }

    console.log('[Test 7B] GET /api/cases/:id/loss/history returns all snapshots in reverse order');
    const historyRes = await fetch(`${baseUrl}/api/cases/${caseAId}/loss/history`);
    const historyJson = await historyRes.json();
    console.log(`Total History Snapshots: ${historyJson.data?.length} (Expected: 4)`);

    if (historyRes.status !== 200 || historyJson.data?.length !== 4) {
      throw new Error(`Expected exactly 4 history records, found ${historyJson.data?.length}`);
    }

    // Verify reverse chronological ordering
    const timestamps = historyJson.data.map((r) => new Date(r.created_at).getTime());
    const isDesc = timestamps.every((t, i) => i === 0 || t <= timestamps[i - 1]);
    console.log(`History sorted in DESC order: ${isDesc}`);
    if (!isDesc) throw new Error('History snapshots are not in reverse chronological order');
    console.log('PASS: Latest snapshot and history retrieval verified.\n');

    // --- TEST 8: Case Scoping & Isolation ---
    console.log('[Test 8] Case route isolation (Case B route cannot see Case A history)');
    const caseBHistoryRes = await fetch(`${baseUrl}/api/cases/${caseBId}/loss/history`);
    const caseBHistoryJson = await caseBHistoryRes.json();
    console.log(`Case B History Count: ${caseBHistoryJson.data?.length} (Expected: 0)`);

    if (caseBHistoryJson.data?.length !== 0) {
      throw new Error('Case B route leaked Case A calculation snapshots!');
    }
    console.log('PASS: Scoping and case isolation verified.\n');

    // --- TEST 9: Database Foreign Key Cascade Verification ---
    console.log('[Test 9] Database CASCADE verification upon case deletion');
    const [calcCountBefore] = await pool.query(
      'SELECT COUNT(*) AS count FROM case_loss_calculations WHERE case_id = ?',
      [caseAId]
    );
    console.log(`Calculations for Case A in MySQL before delete: ${calcCountBefore[0].count}`);

    await pool.query('DELETE FROM cases WHERE id = ?', [caseAId]);
    const [calcCountAfter] = await pool.query(
      'SELECT COUNT(*) AS count FROM case_loss_calculations WHERE case_id = ?',
      [caseAId]
    );
    console.log(`Calculations for Case A in MySQL after delete: ${calcCountAfter[0].count} (Expected: 0)`);

    if (calcCountAfter[0].count !== 0) {
      throw new Error('Foreign key CASCADE deletion failed for case_loss_calculations');
    }
    console.log('PASS: Foreign key CASCADE verification passed.\n');

    console.log('========================================================');
    console.log('      ALL PHASE 6 LOSS CALCULATOR SCENARIOS PASSED      ');
    console.log('========================================================\n');
  } catch (error) {
    console.error('\n[FATAL TEST FAILURE]:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  } finally {
    // Cleanup remaining test cases
    if (createdCaseIds.length > 0) {
      console.log(`[TEARDOWN] Cleaning up ${createdCaseIds.length} test cases...`);
      for (const id of createdCaseIds) {
        await pool.query('DELETE FROM cases WHERE id = ?', [id]);
        console.log(`[TEARDOWN] Deleted test case ID: ${id}`);
      }
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[TEST] Test server stopped.');
    }
    await pool.end();
  }
}

runPhase6LossCalculatorTests();
