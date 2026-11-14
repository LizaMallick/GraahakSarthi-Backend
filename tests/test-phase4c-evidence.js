require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { app } = require('../server');
const pool = require('../src/config/db');

const TEST_PORT = 5096;

async function runPhase4CTests() {
  console.log('========================================================');
  console.log('   Graahak AI - Phase 4C Evidence Engine Test Suite     ');
  console.log('========================================================\n');

  const createdCaseIds = [];
  const filesToClean = [];
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

    // --- SETUP: Create Case 1 (DEFECTIVE_PRODUCT) ---
    console.log('[Setup] Creating Case 1 (DEFECTIVE_PRODUCT)...');
    const case1Res = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_1: Defective 4K Monitor Panel',
        issue_category: 'DEFECTIVE_PRODUCT',
        merchant_name: 'DisplayTech Supermart',
        claimed_amount: 35000.0,
        user_narrative: 'Vertical green lines appeared on display. Service center claims customer physical damage.',
      }),
    });
    const case1Json = await case1Res.json();
    const case1Id = String(case1Json.data.id);
    createdCaseIds.push(case1Id);
    console.log(`[Setup] Case 1 created with ID: ${case1Id}\n`);

    // --- TEST 1: Invalid ID and Nonexistent Case Error Handling ---
    console.log('[Test 1A] POST /api/cases/invalid-id/evidence/evaluate (Invalid ID)');
    const invalidIdRes = await fetch(`${baseUrl}/api/cases/invalid-id/evidence/evaluate`, { method: 'POST' });
    console.log(`Status: ${invalidIdRes.status} (Expected: 400)`);
    if (invalidIdRes.status !== 400) throw new Error('Expected 400 for invalid case ID');

    console.log('[Test 1B] POST /api/cases/99999999/evidence/evaluate (Nonexistent case)');
    const notFoundRes = await fetch(`${baseUrl}/api/cases/99999999/evidence/evaluate`, { method: 'POST' });
    console.log(`Status: ${notFoundRes.status} (Expected: 404)`);
    if (notFoundRes.status !== 404) throw new Error('Expected 404 for nonexistent case');

    console.log('[Test 1C] GET /api/cases/99999999/evidence (Nonexistent case)');
    const getNotFoundRes = await fetch(`${baseUrl}/api/cases/99999999/evidence`);
    console.log(`Status: ${getNotFoundRes.status} (Expected: 404)`);
    if (getNotFoundRes.status !== 404) throw new Error('Expected 404 on GET for nonexistent case');
    console.log('PASS: Invalid ID and 404 handling verified.\n');

    // --- TEST 2: Empty Evidence Baseline Evaluation (0 Documents) ---
    console.log('[Test 2] POST /api/cases/:id/evidence/evaluate - Baseline (0 Documents)');
    const baselineRes = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const baselineJson = await baselineRes.json();
    console.log(`Status: ${baselineRes.status} (Expected: 200)`);
    console.log(`Score: ${baselineJson.data?.evidence_coverage_score} (Expected: 0)`);
    console.log(`Level: ${baselineJson.data?.coverage_level} (Expected: WEAK)`);

    const pBreakdown = baselineJson.data?.pillar_breakdown;
    console.log(`Pillars: Purchase=${pBreakdown?.proof_of_purchase?.score}, Payment=${pBreakdown?.proof_of_payment?.score}, Defect=${pBreakdown?.proof_of_defect_or_deficiency?.score}, Comm=${pBreakdown?.written_communication?.score}`);

    // Verify PAYMENT_RECEIPT is explicitly included in missing proofs
    const missingTypes = baselineJson.data?.missing_proofs?.map((m) => m.proof_type);
    console.log(`Missing Proof Types: ${JSON.stringify(missingTypes)}`);
    const hasPaymentMissing = missingTypes?.includes('PAYMENT_RECEIPT');
    console.log(`PAYMENT_RECEIPT in missing proofs: ${hasPaymentMissing}`);

    if (
      baselineRes.status !== 200 ||
      baselineJson.data?.evidence_coverage_score !== 0 ||
      baselineJson.data?.coverage_level !== 'WEAK' ||
      !hasPaymentMissing ||
      !baselineJson.data?.disclaimer
    ) {
      throw new Error('Baseline 0-document evaluation failed assertions');
    }
    console.log('PASS: Empty evidence correctly evaluated as 0 points (WEAK) with all pillars reported.\n');

    // Helper: Upload a document to a case
    async function uploadDoc(caseId, docType, filename, mimeType, description = null) {
      const form = new FormData();
      let content;
      if (mimeType === 'image/png' || filename.endsWith('.png')) {
        // Valid PNG magic signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
        content = Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
          Buffer.from(`Sample PNG payload for ${docType}`),
        ]);
      } else {
        // Valid PDF magic signature: %PDF-
        content = Buffer.from(`%PDF-1.4\nSample test payload for ${docType}\n%%EOF`);
      }
      const blob = new Blob([content], { type: mimeType });
      form.append('file', blob, filename);
      form.append('document_type', docType);
      if (description) form.append('description', description);

      const res = await fetch(`${baseUrl}/api/cases/${caseId}/documents`, { method: 'POST', body: form });
      const json = await res.json();
      if (res.status !== 201) throw new Error(`Upload failed for ${docType}: ${JSON.stringify(json)}`);
      return json.data;
    }

    // --- TEST 3: Standalone WARRANTY_DOCUMENT earns ZERO points ---
    console.log('[Test 3] Upload standalone WARRANTY_DOCUMENT -> must earn 0 points');
    const warrantyDoc = await uploadDoc(case1Id, 'WARRANTY_DOCUMENT', 'monitor_warranty_card.pdf', 'application/pdf');
    console.log(`Uploaded doc ID: ${warrantyDoc.id} (WARRANTY_DOCUMENT)`);

    const eval3Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval3Json = await eval3Res.json();
    console.log(`Pillar 1 Score: ${eval3Json.data?.pillar_breakdown?.proof_of_purchase?.score} (Expected: 0)`);
    console.log(`Total Score: ${eval3Json.data?.evidence_coverage_score} (Expected: 0)`);

    if (eval3Json.data?.pillar_breakdown?.proof_of_purchase?.score !== 0 || eval3Json.data?.evidence_coverage_score !== 0) {
      throw new Error('Standalone WARRANTY_DOCUMENT should score 0 points for Pillar 1');
    }
    console.log('PASS: Standalone WARRANTY_DOCUMENT earns 0 points as required.\n');

    // --- TEST 4: Goods ORDER_CONFIRMATION alone earns 20 points ---
    console.log('[Test 4] Upload ORDER_CONFIRMATION for Goods case');
    // Delete standalone warranty first to test order confirmation in isolation
    await fetch(`${baseUrl}/api/cases/${case1Id}/documents/${warrantyDoc.id}`, { method: 'DELETE' });

    const orderDoc = await uploadDoc(case1Id, 'ORDER_CONFIRMATION', 'order_receipt.png', 'image/png');
    console.log(`Uploaded doc ID: ${orderDoc.id} (ORDER_CONFIRMATION)`);

    const eval4Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval4Json = await eval4Res.json();
    console.log(`Pillar 1 Score: ${eval4Json.data?.pillar_breakdown?.proof_of_purchase?.score} (Expected: 20)`);
    console.log(`Total Score: ${eval4Json.data?.evidence_coverage_score} (Expected: 20)`);

    if (eval4Json.data?.pillar_breakdown?.proof_of_purchase?.score !== 20 || eval4Json.data?.evidence_coverage_score !== 20) {
      throw new Error('ORDER_CONFIRMATION for goods should score 20 points');
    }
    console.log('PASS: Goods ORDER_CONFIRMATION scores exactly 20 points.\n');

    // --- TEST 5: ORDER_CONFIRMATION + WARRANTY_DOCUMENT bonus (+10 pts) -> 30 capped ---
    console.log('[Test 5] Re-upload WARRANTY_DOCUMENT alongside ORDER_CONFIRMATION -> earns +10 bonus (30 capped)');
    await uploadDoc(case1Id, 'WARRANTY_DOCUMENT', 'warranty_terms.pdf', 'application/pdf');

    const eval5Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval5Json = await eval5Res.json();
    console.log(`Pillar 1 Score: ${eval5Json.data?.pillar_breakdown?.proof_of_purchase?.score} (Expected: 30)`);
    console.log(`Total Score: ${eval5Json.data?.evidence_coverage_score} (Expected: 30)`);

    if (eval5Json.data?.pillar_breakdown?.proof_of_purchase?.score !== 30 || eval5Json.data?.evidence_coverage_score !== 30) {
      throw new Error('ORDER_CONFIRMATION + WARRANTY_DOCUMENT should top up Pillar 1 to 30 points');
    }
    console.log('PASS: Warranty bonus (+10) correctly activated when supported by ORDER_CONFIRMATION.\n');

    // --- TEST 6: OTHER document earns ZERO points across all pillars ---
    console.log('[Test 6] Upload OTHER document -> must add 0 points to all pillars');
    await uploadDoc(case1Id, 'OTHER', 'random_unrelated_attachment.pdf', 'application/pdf');

    const eval6Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval6Json = await eval6Res.json();
    console.log(`Total Score after OTHER upload: ${eval6Json.data?.evidence_coverage_score} (Expected: 30)`);

    const otherProofItem = eval6Json.data?.provided_proofs?.find((p) => p.document_type === 'OTHER');
    console.log(`OTHER item note present: "${otherProofItem?.note !== undefined}"`);

    if (eval6Json.data?.evidence_coverage_score !== 30 || !otherProofItem?.note) {
      throw new Error('OTHER document must earn 0 points and carry an advisory note');
    }
    console.log('PASS: OTHER document earns 0 points across all pillars.\n');

    // --- TEST 7: Adding PAYMENT_RECEIPT -> score crosses into MODERATE (50 pts) ---
    console.log('[Test 7] Upload PAYMENT_RECEIPT (+20 pts) -> score crosses into MODERATE (50 pts)');
    await uploadDoc(case1Id, 'PAYMENT_RECEIPT', 'bank_debit_statement.pdf', 'application/pdf');

    const eval7Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval7Json = await eval7Res.json();
    console.log(`Pillar 2 Score: ${eval7Json.data?.pillar_breakdown?.proof_of_payment?.score} (Expected: 20)`);
    console.log(`Total Score: ${eval7Json.data?.evidence_coverage_score} (Expected: 50)`);
    console.log(`Coverage Level: ${eval7Json.data?.coverage_level} (Expected: MODERATE)`);

    if (
      eval7Json.data?.pillar_breakdown?.proof_of_payment?.score !== 20 ||
      eval7Json.data?.evidence_coverage_score !== 50 ||
      eval7Json.data?.coverage_level !== 'MODERATE'
    ) {
      throw new Error('Failed to transition to MODERATE coverage tier at 50 points');
    }
    console.log('PASS: Score reached 50 points and level transitioned to MODERATE.\n');

    // --- TEST 8: Reaching STRONG with Incomplete Pillars (80 pts with Pillar 4 = 0) ---
    console.log('[Test 8] Upload Defect Proofs (Pillar 3 = 30 capped) -> Score = 80 (STRONG), but Pillar 4 is 0');
    // Upload JOB_SHEET_OR_REPORT (25) + DEFECT_EVIDENCE (15) -> sum 40, capped at 30
    await uploadDoc(case1Id, 'JOB_SHEET_OR_REPORT', 'service_inspection_job_sheet.pdf', 'application/pdf');
    await uploadDoc(case1Id, 'DEFECT_EVIDENCE', 'monitor_green_lines.png', 'image/png');

    const eval8Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval8Json = await eval8Res.json();
    console.log(`Pillar 3 Score: ${eval8Json.data?.pillar_breakdown?.proof_of_defect_or_deficiency?.score} (Expected: 30)`);
    console.log(`Pillar 4 Score: ${eval8Json.data?.pillar_breakdown?.written_communication?.score} (Expected: 0)`);
    console.log(`Total Score: ${eval8Json.data?.evidence_coverage_score} (Expected: 80)`);
    console.log(`Coverage Level: ${eval8Json.data?.coverage_level} (Expected: STRONG)`);

    // Invariant Check: COMMUNICATION_RECORD MUST STILL BE in missing_proofs!
    const missingPillar4 = eval8Json.data?.missing_proofs?.find((m) => m.proof_type === 'COMMUNICATION_RECORD');
    console.log(`Missing COMMUNICATION_RECORD still reported: ${missingPillar4 !== undefined}`);
    console.log(`Priority of missing communication: ${missingPillar4?.priority}`);

    if (
      eval8Json.data?.pillar_breakdown?.proof_of_defect_or_deficiency?.score !== 30 ||
      eval8Json.data?.evidence_coverage_score !== 80 ||
      eval8Json.data?.coverage_level !== 'STRONG' ||
      !missingPillar4 ||
      missingPillar4.priority !== 'HIGH'
    ) {
      throw new Error('CRITICAL INVARIANT FAILED: STRONG level must still report missing proofs when a pillar is incomplete');
    }
    console.log('PASS: Invariant verified: Case is STRONG (80 pts) but still reports missing communication proof.\n');

    // --- TEST 9: Full 100% Coverage Across All 4 Pillars ---
    console.log('[Test 9] Upload COMMUNICATION_RECORD (+20 pts) -> 100% Coverage (STRONG, 0 missing)');
    await uploadDoc(case1Id, 'COMMUNICATION_RECORD', 'merchant_escalation_email.pdf', 'application/pdf');

    const eval9Res = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence/evaluate`, { method: 'POST' });
    const eval9Json = await eval9Res.json();
    console.log(`Total Score: ${eval9Json.data?.evidence_coverage_score} (Expected: 100)`);
    console.log(`Pillar 4 Score: ${eval9Json.data?.pillar_breakdown?.written_communication?.score} (Expected: 20)`);
    console.log(`Missing Proofs count: ${eval9Json.data?.missing_proofs?.length} (Expected: 0)`);

    if (
      eval9Json.data?.evidence_coverage_score !== 100 ||
      eval9Json.data?.pillar_breakdown?.written_communication?.score !== 20 ||
      eval9Json.data?.missing_proofs?.length !== 0
    ) {
      throw new Error('Expected 100 points and empty missing proofs when all 4 pillars are satisfied');
    }
    console.log('PASS: 100% coverage achieved; all four pillars satisfied.\n');

    // --- TEST 10: Category-Specific Scoring (DEFICIENCY_IN_SERVICE: 25 pts for contract) ---
    console.log('[Test 10] Category-Specific Scoring: DEFICIENCY_IN_SERVICE service agreement (25 pts)');
    const case2Res = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_2: Home Renovation Service Incompletion',
        issue_category: 'DEFICIENCY_IN_SERVICE',
        merchant_name: 'City Premier Renovators',
        claimed_amount: 120000.0,
        user_narrative: 'Contractor abandoned modular kitchen renovation midway after receiving 80% payment.',
      }),
    });
    const case2Json = await case2Res.json();
    const case2Id = String(case2Json.data.id);
    createdCaseIds.push(case2Id);

    // Upload ORDER_CONFIRMATION representing Service Agreement for a service case
    await uploadDoc(case2Id, 'ORDER_CONFIRMATION', 'renovation_contract_agreement.pdf', 'application/pdf', 'Signed Scope of Work and Milestones');

    const eval10Res = await fetch(`${baseUrl}/api/cases/${case2Id}/evidence/evaluate`, { method: 'POST' });
    const eval10Json = await eval10Res.json();
    console.log(`Case 2 Category: DEFICIENCY_IN_SERVICE`);
    console.log(`Pillar 1 Score for Service Agreement: ${eval10Json.data?.pillar_breakdown?.proof_of_purchase?.score} (Expected: 25)`);

    if (eval10Json.data?.pillar_breakdown?.proof_of_purchase?.score !== 25) {
      throw new Error('Service agreement (ORDER_CONFIRMATION) under DEFICIENCY_IN_SERVICE should earn 25 points');
    }
    console.log('PASS: Service agreement scored 25 points, differing from goods order confirmation (20 pts).\n');

    // --- TEST 11: Snapshot Persistence & Retrieval (GET /api/cases/:id/evidence) ---
    console.log('[Test 11] Verification of persistence in evidence_evaluations and GET /api/cases/:id/evidence');
    const getEvidenceRes = await fetch(`${baseUrl}/api/cases/${case1Id}/evidence`);
    const getEvidenceJson = await getEvidenceRes.json();
    console.log(`Status: ${getEvidenceRes.status} (Expected: 200)`);
    console.log(`Retrieved Score: ${getEvidenceJson.data?.evidence_coverage_score} (Expected: 100)`);
    console.log(`Retrieved Level: ${getEvidenceJson.data?.coverage_level} (Expected: STRONG)`);

    // Verify row in MySQL evidence_evaluations table
    const [dbEvals] = await pool.query('SELECT * FROM evidence_evaluations WHERE case_id = ? ORDER BY id DESC', [case1Id]);
    console.log(`Total snapshots persisted in MySQL for Case 1: ${dbEvals.length}`);
    console.log(`Latest snapshot strength_score in DB: ${dbEvals[0]?.strength_score}`);
    console.log(`Latest snapshot strength_level in DB: ${dbEvals[0]?.strength_level}`);

    if (
      getEvidenceRes.status !== 200 ||
      getEvidenceJson.data?.evidence_coverage_score !== 100 ||
      dbEvals.length === 0 ||
      dbEvals[0]?.strength_score !== 100
    ) {
      throw new Error('Evidence evaluation retrieval or database snapshot persistence failed');
    }
    console.log('PASS: Evidence snapshot persisted in MySQL and retrieved accurately via GET endpoint.\n');

    console.log('========================================================');
    console.log('       ALL 11 PHASE 4C TEST SCENARIOS PASSED            ');
    console.log('========================================================\n');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Teardown: Delete all created test cases (cascades to case_documents and evidence_evaluations)
    if (createdCaseIds.length > 0) {
      console.log(`[TEARDOWN] Cleaning up ${createdCaseIds.length} test cases...`);
      for (const id of createdCaseIds) {
        // Query attached document files to unlink from uploads directory
        const [docs] = await pool.query('SELECT file_path FROM case_documents WHERE case_id = ?', [id]);
        for (const d of docs) {
          if (d.file_path && fs.existsSync(d.file_path)) {
            try {
              fs.unlinkSync(d.file_path);
              console.log(`[TEARDOWN] Unlinked test file: ${path.basename(d.file_path)}`);
            } catch (e) {
              // ignore
            }
          }
        }
        await pool.query('DELETE FROM cases WHERE id = ?', [id]);
        console.log(`[TEARDOWN] Deleted test case ID: ${id}`);
      }
    }

    if (server) {
      server.close();
      console.log('[TEST] Test server stopped.');
    }
    await pool.end();
  }
}

runPhase4CTests();
