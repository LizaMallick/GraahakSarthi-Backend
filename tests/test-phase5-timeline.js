require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { app } = require('../server');
const pool = require('../src/config/db');
const CaseService = require('../src/services/caseService');
const DocumentService = require('../src/services/documentService');
const EvidenceService = require('../src/services/evidenceService');
const TimelineService = require('../src/services/timelineService');

const TEST_PORT = 5094;

async function runPhase5TimelineTests() {
  console.log('========================================================');
  console.log('   Graahak AI - Phase 5 Case Timeline Test Suite        ');
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

    // --- SETUP: Create Case A (DEFECTIVE_PRODUCT) ---
    console.log('[Setup] Creating Case A (DEFECTIVE_PRODUCT)...');
    const caseARes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_A: Defective Laptop Motherboard',
        issue_category: 'DEFECTIVE_PRODUCT',
        merchant_name: 'ComputeDirect Online India',
        claimed_amount: 62000.0,
        user_narrative: 'Laptop shut down completely after 3 days. Service center refuses repair.',
      }),
    });
    const caseAJson = await caseARes.json();
    console.log(`Setup Case A Status: ${caseARes.status} (Expected: 201)`);
    if (caseARes.status !== 201 || !caseAJson.data?.id) {
      throw new Error(`Failed to create setup Case A: ${JSON.stringify(caseAJson)}`);
    }
    const caseAId = String(caseAJson.data.id);
    createdCaseIds.push(caseAId);
    console.log(`[Setup] Case A created with ID: ${caseAId}`);

    // --- SETUP: Create Case B (DEFICIENCY_IN_SERVICE) for cross-case testing ---
    console.log('[Setup] Creating Case B (DEFICIENCY_IN_SERVICE)...');
    const caseBRes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_B: Flight Cancellation Without Refund',
        issue_category: 'DEFICIENCY_IN_SERVICE',
        merchant_name: 'SkyHigh Airlines Ltd',
        claimed_amount: 18500.0,
        user_narrative: 'Flight cancelled 2 hours prior without providing alternative or refund.',
      }),
    });
    const caseBJson = await caseBRes.json();
    console.log(`Setup Case B Status: ${caseBRes.status} (Expected: 201)`);
    if (caseBRes.status !== 201 || !caseBJson.data?.id) {
      throw new Error(`Failed to create setup Case B: ${JSON.stringify(caseBJson)}`);
    }
    const caseBId = String(caseBJson.data.id);
    createdCaseIds.push(caseBId);
    console.log(`[Setup] Case B created with ID: ${caseBId}\n`);

    // --- TEST 1: Invalid & Nonexistent Case IDs Error Handling ---
    console.log('[Test 1A] GET /api/cases/invalid-id/timeline (Invalid case ID)');
    const invCaseRes = await fetch(`${baseUrl}/api/cases/invalid-id/timeline`);
    console.log(`Status: ${invCaseRes.status} (Expected: 400)`);
    if (invCaseRes.status !== 400) throw new Error('Expected 400 for invalid case ID');

    console.log('[Test 1B] GET /api/cases/99999999/timeline (Nonexistent case ID)');
    const notFoundRes = await fetch(`${baseUrl}/api/cases/99999999/timeline`);
    console.log(`Status: ${notFoundRes.status} (Expected: 404)`);
    if (notFoundRes.status !== 404) throw new Error('Expected 404 for nonexistent case ID');

    console.log('[Test 1C] PATCH /api/cases/:id/timeline/invalid-event-id (Invalid event ID)');
    const invEventRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline/invalid-event-id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });
    console.log(`Status: ${invEventRes.status} (Expected: 400)`);
    if (invEventRes.status !== 400) throw new Error('Expected 400 for invalid event ID');

    console.log('PASS: Invalid ID and nonexistent case error handling verified.\n');

    // --- TEST 2: Automatic Milestone on Case Creation ---
    console.log('[Test 2] Automatic Milestone on Case Creation (SYSTEM_MILESTONE)');
    const timelineARes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`);
    const timelineAJson = await timelineARes.json();
    console.log(`Status: ${timelineARes.status} (Expected: 200)`);
    console.log(`Total events found for Case A: ${timelineAJson.data?.length}`);

    const caseCreatedEvent = timelineAJson.data?.find((e) => e.source_type === 'SYSTEM_MILESTONE');
    console.log(`Creation Event Title: "${caseCreatedEvent?.title}"`);
    console.log(`Creation Event Category Mentioned: ${caseCreatedEvent?.description?.includes('DEFECTIVE_PRODUCT')}`);

    if (
      timelineARes.status !== 200 ||
      !caseCreatedEvent ||
      !caseCreatedEvent.title.includes('Case Registered') ||
      !caseCreatedEvent.description.includes('DEFECTIVE_PRODUCT')
    ) {
      throw new Error('Automatic case creation milestone was not properly generated');
    }
    console.log('PASS: Automatic case creation milestone verified successfully.\n');

    // --- TEST 3: Manual Event Creation & Validation ---
    console.log('[Test 3A] Reject manual event with disallowed source_type (SYSTEM_MILESTONE)');
    const disallowedRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-05T10:00:00Z',
        title: 'Unauthorized system milestone attempt',
        source_type: 'SYSTEM_MILESTONE',
      }),
    });
    console.log(`Status: ${disallowedRes.status} (Expected: 400)`);
    if (disallowedRes.status !== 400) throw new Error('Expected 400 for disallowed manual source_type');

    console.log('[Test 3B] Reject manual event with unexpected request body field');
    const unexpectedFieldRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-05T10:00:00Z',
        title: 'Valid Title',
        rogue_field: 'unauthorized_payload',
      }),
    });
    console.log(`Status: ${unexpectedFieldRes.status} (Expected: 400)`);
    if (unexpectedFieldRes.status !== 400) throw new Error('Expected 400 for unexpected body field');

    console.log('[Test 3C] Reject manual event with order_index out of bounds');
    const outOfBoundsRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-05T10:00:00Z',
        title: 'Valid Title',
        order_index: 999999999,
      }),
    });
    console.log(`Status: ${outOfBoundsRes.status} (Expected: 400)`);
    if (outOfBoundsRes.status !== 400) throw new Error('Expected 400 for out-of-bounds order_index');

    console.log('[Test 3D] Successful manual event creation with COMMUNICATION');
    const manualEventRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-10T11:30:00Z',
        title: 'Formal Grievance Email Sent to Merchant',
        description: 'Sent formal demand for replacement or full refund within 7 days.',
        source_type: 'COMMUNICATION',
        order_index: 1,
      }),
    });
    const manualEventJson = await manualEventRes.json();
    console.log(`Status: ${manualEventRes.status} (Expected: 201)`);
    console.log(`Created Event ID: ${manualEventJson.data?.id}`);
    console.log(`Source Type: ${manualEventJson.data?.source_type}`);
    const manualEvent1Id = manualEventJson.data?.id;

    if (
      manualEventRes.status !== 201 ||
      !manualEvent1Id ||
      manualEventJson.data.source_type !== 'COMMUNICATION'
    ) {
      throw new Error('Failed to create valid manual timeline event');
    }
    console.log('PASS: Manual timeline event created and validated successfully.\n');

    // --- TEST 4: Chronological Ordering & Sorting (ASC and DESC) ---
    console.log('[Test 4] Add earlier and later events and test ASC/DESC sorting');
    // Add earlier event
    const earlierRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-01T09:00:00Z',
        title: 'Laptop Delivered by Merchant',
        description: 'Package delivered at residential address.',
        source_type: 'USER_INPUT',
      }),
    });
    const earlierJson = await earlierRes.json();
    console.log(`Earlier Event Status: ${earlierRes.status} (Expected: 201) | ID: ${earlierJson.data?.id}`);
    if (earlierRes.status !== 201 || !earlierJson.data?.id) throw new Error('Failed to create earlier test event');

    // Add later event
    const laterRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-25T14:00:00Z',
        title: 'District Commission Notice Dispatched',
        description: 'Pre-litigation legal notice served via speed post.',
        source_type: 'HEARING',
      }),
    });
    const laterJson = await laterRes.json();
    console.log(`Later Event Status: ${laterRes.status} (Expected: 201) | ID: ${laterJson.data?.id}`);
    if (laterRes.status !== 201 || !laterJson.data?.id) throw new Error('Failed to create later test event');

    // Default ASC
    const ascRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`);
    const ascJson = await ascRes.json();
    const ascDates = ascJson.data.map((e) => new Date(e.event_date).getTime());
    const isStrictlyAsc = ascDates.every((d, i) => i === 0 || d >= ascDates[i - 1]);
    console.log(`Default ASC Events Count: ${ascJson.data.length} | Sorted ASC: ${isStrictlyAsc}`);

    // DESC
    const descRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline?sort=DESC`);
    const descJson = await descRes.json();
    const descDates = descJson.data.map((e) => new Date(e.event_date).getTime());
    const isStrictlyDesc = descDates.every((d, i) => i === 0 || d <= descDates[i - 1]);
    console.log(`DESC Query Events Count: ${descJson.data.length} | Sorted DESC: ${isStrictlyDesc}`);

    // Invalid sort parameter (T3B)
    const invalidSortRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline?sort=INVALID_SORT`);
    console.log(`Invalid Sort Status: ${invalidSortRes.status} (Expected: 400)`);
    if (invalidSortRes.status !== 400) {
      throw new Error('Expected 400 when passing invalid sort parameter');
    }

    if (!isStrictlyAsc || !isStrictlyDesc) {
      throw new Error('Chronological sorting failed for ASC or DESC query parameter');
    }
    console.log('PASS: Chronological sorting (ASC default & DESC query) and invalid sort validation verified.\n');

    // --- TEST 5: Automatic Milestone on Document Upload & Linkage ---
    console.log('[Test 5] Automatic Milestone on Document Upload');
    const form = new FormData();
    const invoiceContent = Buffer.from('%PDF-1.4\nPDF_TAX_INVOICE_TEST_PAYLOAD\n%%EOF');
    const invoiceBlob = new Blob([invoiceContent], { type: 'application/pdf' });
    form.append('file', invoiceBlob, 'laptop_tax_invoice.pdf');
    form.append('document_type', 'TAX_INVOICE');
    form.append('description', 'Official retail GST invoice for laptop purchase.');

    const uploadRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: form,
    });
    const uploadJson = await uploadRes.json();
    console.log(`Upload Status: ${uploadRes.status} (Expected: 201)`);
    const uploadedDocId = String(uploadJson.data?.id);
    console.log(`Uploaded Document ID: ${uploadedDocId}`);

    // Inspect timeline for DOCUMENT_UPLOAD event
    const timelineAfterUpload = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline?source_type=DOCUMENT_UPLOAD`);
    const timelineUploadJson = await timelineAfterUpload.json();
    const docUploadEvent = timelineUploadJson.data?.[0];

    console.log(`Document Upload Event Found: ${!!docUploadEvent}`);
    console.log(`Event Title: "${docUploadEvent?.title}"`);
    console.log(`Linked Document ID in event: ${docUploadEvent?.document_id}`);
    console.log(`Linked Document Type: ${docUploadEvent?.linked_document?.document_type}`);

    if (
      uploadRes.status !== 201 ||
      !docUploadEvent ||
      docUploadEvent.document_id !== uploadedDocId ||
      docUploadEvent.linked_document?.document_type !== 'TAX_INVOICE'
    ) {
      throw new Error('Automatic document upload milestone failed validation');
    }
    console.log('PASS: Automatic document upload milestone and linkage verified.\n');

    // --- TEST 6: Linked Document Metadata & Privacy (Zero file_path exposure) ---
    console.log('[Test 6] Privacy Check: Ensure no internal file paths are exposed in timeline');
    const allEventsRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`);
    const allEventsJson = await allEventsRes.json();

    const exposedPathFound = allEventsJson.data.some((e) => {
      if (e.file_path || e.stored_filename) return true;
      if (e.linked_document && (e.linked_document.file_path || e.linked_document.stored_filename)) return true;
      return false;
    });
    console.log(`Any file_path or stored_filename leaked in timeline: ${exposedPathFound}`);

    if (exposedPathFound) {
      throw new Error('Security Violation: internal file_path or stored_filename was exposed in timeline response');
    }
    console.log('PASS: Privacy verified: No internal filesystem paths leaked.\n');

    // --- TEST 7: Automatic Milestone on Evidence Evaluation & Deduplication ---
    console.log('[Test 7A] Trigger Evidence Evaluation -> Milestone created');
    const evalRes1 = await fetch(`${baseUrl}/api/cases/${caseAId}/evidence/evaluate`, { method: 'POST' });
    const evalJson1 = await evalRes1.json();
    console.log(`Evaluation 1 Status: ${evalRes1.status} (Expected: 200)`);
    console.log(`Score: ${evalJson1.data?.evidence_coverage_score} | Level: ${evalJson1.data?.coverage_level}`);

    const timelineEvalRes1 = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline?source_type=EVIDENCE_EVALUATION`);
    const timelineEvalJson1 = await timelineEvalRes1.json();
    console.log(`Evaluation Milestones Count: ${timelineEvalJson1.data?.length} (Expected: 1)`);
    console.log(`Milestone Title: "${timelineEvalJson1.data?.[0]?.title}"`);

    if (timelineEvalJson1.data?.length !== 1) {
      throw new Error('Expected exactly 1 evaluation milestone after first evaluation');
    }

    console.log('[Test 7B] Deduplication: Run consecutive identical evaluation -> No duplicate event created');
    const evalRes2 = await fetch(`${baseUrl}/api/cases/${caseAId}/evidence/evaluate`, { method: 'POST' });
    if (evalRes2.status !== 200) throw new Error('Second evaluation failed');

    const timelineEvalRes2 = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline?source_type=EVIDENCE_EVALUATION`);
    const timelineEvalJson2 = await timelineEvalRes2.json();
    console.log(`Evaluation Milestones Count after re-eval: ${timelineEvalJson2.data?.length} (Expected: 1)`);

    if (timelineEvalJson2.data?.length !== 1) {
      throw new Error('Duplicate identical evaluation event was created despite deduplication rule');
    }
    console.log('PASS: Automatic evaluation milestone and consecutive deduplication verified.\n');

    // [Test 7C] Changed-Score Milestone (T3A): Upload document changing score -> New milestone created
    console.log('[Test 7C] Verify changed evidence score triggers a new evaluation milestone');
    const paymentForm = new FormData();
    const paymentBlob = new Blob([Buffer.from('%PDF-1.4\nPDF_PAYMENT_RECEIPT_TEST_PAYLOAD\n%%EOF')], { type: 'application/pdf' });
    paymentForm.append('file', paymentBlob, 'laptop_payment_receipt.pdf');
    paymentForm.append('document_type', 'PAYMENT_RECEIPT');
    paymentForm.append('description', 'UPI transaction receipt for laptop.');

    const paymentUploadRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: paymentForm,
    });
    if (paymentUploadRes.status !== 201) throw new Error('Failed to upload PAYMENT_RECEIPT in Test 7C');

    const evalRes3 = await fetch(`${baseUrl}/api/cases/${caseAId}/evidence/evaluate`, { method: 'POST' });
    const evalJson3 = await evalRes3.json();
    console.log(`Evaluation 3 Status: ${evalRes3.status} | New Score: ${evalJson3.data?.evidence_coverage_score} | Level: ${evalJson3.data?.coverage_level}`);

    // Verify score actually changed from evalJson1
    const previousScore = evalJson1.data?.evidence_coverage_score;
    const newScore = evalJson3.data?.evidence_coverage_score;
    if (newScore === previousScore) {
      throw new Error(`Test 7C precondition failed: Evidence score did not change (${previousScore} -> ${newScore})`);
    }

    const timelineEvalRes3 = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline?source_type=EVIDENCE_EVALUATION`);
    const timelineEvalJson3 = await timelineEvalRes3.json();
    console.log(`Evaluation Milestones Count after score change: ${timelineEvalJson3.data?.length} (Expected: 2)`);
    console.log(`Latest Milestone Title: "${timelineEvalJson3.data?.[1]?.title || timelineEvalJson3.data?.[0]?.title}"`);

    if (timelineEvalJson3.data?.length !== 2) {
      throw new Error(`Expected exactly 2 evaluation milestones after score change, got ${timelineEvalJson3.data?.length}`);
    }
    console.log('PASS: Changed evidence score successfully produced a new evaluation milestone.\n');

    // --- TEST 8: Cross-Case IDOR Protection on Event & Document Operations ---
    console.log('[Test 8A] Cross-Case: Case B attempts to PATCH Case A timeline event');
    const crossPatchRes = await fetch(`${baseUrl}/api/cases/${caseBId}/timeline/${manualEvent1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Malicious Cross-Case Update' }),
    });
    console.log(`Status: ${crossPatchRes.status} (Expected: 404)`);
    if (crossPatchRes.status !== 404) throw new Error('Expected 404 for cross-case PATCH');

    console.log('[Test 8B] Cross-Case: Case B attempts to DELETE Case A timeline event');
    const crossDeleteRes = await fetch(`${baseUrl}/api/cases/${caseBId}/timeline/${manualEvent1Id}`, {
      method: 'DELETE',
    });
    console.log(`Status: ${crossDeleteRes.status} (Expected: 404)`);
    if (crossDeleteRes.status !== 404) throw new Error('Expected 404 for cross-case DELETE');

    console.log('[Test 8C] Cross-Case: Case B attempts to create event linking Case A document');
    const crossDocLinkRes = await fetch(`${baseUrl}/api/cases/${caseBId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_date: '2024-03-12T10:00:00Z',
        title: 'Attempting to link foreign document',
        document_id: Number(uploadedDocId),
      }),
    });
    console.log(`Status: ${crossDocLinkRes.status} (Expected: 400)`);
    if (crossDocLinkRes.status !== 400) throw new Error('Expected 400 for cross-case document linking');
    console.log('PASS: Cross-case IDOR protection verified for events and linked documents.\n');

    // --- TEST 9: System-Generated Event Protection ---
    console.log('[Test 9A] Attempt to PATCH system-generated event (SYSTEM_MILESTONE) -> 403 Forbidden');
    const patchSysRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline/${caseCreatedEvent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Tampered System Milestone' }),
    });
    console.log(`Status: ${patchSysRes.status} (Expected: 403)`);
    if (patchSysRes.status !== 403) throw new Error('Expected 403 when updating system-generated event');

    console.log('[Test 9B] Attempt to DELETE system-generated event (SYSTEM_MILESTONE) -> 403 Forbidden');
    const delSysRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline/${caseCreatedEvent.id}`, {
      method: 'DELETE',
    });
    console.log(`Status: ${delSysRes.status} (Expected: 403)`);
    if (delSysRes.status !== 403) throw new Error('Expected 403 when deleting system-generated event');

    console.log('[Test 9C] Attempt to modify source_type or case_id via PATCH -> 400 Bad Request');
    const patchImmutableRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline/${manualEvent1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: 'SYSTEM_MILESTONE' }),
    });
    console.log(`Status: ${patchImmutableRes.status} (Expected: 400)`);
    if (patchImmutableRes.status !== 400) throw new Error('Expected 400 when modifying immutable fields');
    console.log('PASS: System-generated event protection and immutable field rejection verified.\n');

    // --- TEST 10: Manual Event Update (PATCH) and Safe Deletion (DELETE) ---
    console.log('[Test 10A] PATCH manual event title and description');
    const updateRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline/${manualEvent1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated Notice: Received Confirmation from Merchant',
        description: 'Merchant confirmed receipt of notice and offered service inspection.',
      }),
    });
    const updateJson = await updateRes.json();
    console.log(`Update Status: ${updateRes.status} (Expected: 200)`);
    console.log(`Updated Title: "${updateJson.data?.title}"`);

    if (
      updateRes.status !== 200 ||
      updateJson.data?.title !== 'Updated Notice: Received Confirmation from Merchant'
    ) {
      throw new Error('Failed to update manual timeline event');
    }

    console.log('[Test 10B] DELETE manual event safely');
    const deleteRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline/${manualEvent1Id}`, {
      method: 'DELETE',
    });
    const deleteJson = await deleteRes.json();
    console.log(`Delete Status: ${deleteRes.status} (Expected: 200)`);
    console.log(`Deleted payload: ${JSON.stringify(deleteJson.data)}`);

    // Verify deletion via GET
    const checkDeletedRes = await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`);
    const checkDeletedJson = await checkDeletedRes.json();
    const eventStillExists = checkDeletedJson.data.some((e) => e.id === manualEvent1Id);
    console.log(`Event still present after DELETE: ${eventStillExists}`);

    if (deleteRes.status !== 200 || !deleteJson.data?.deleted || eventStillExists) {
      throw new Error('Manual event deletion was not persisted properly');
    }
    console.log('PASS: Manual event update and deletion verified.\n');

    // --- TEST 11: Transactional Consistency & Rollback Tests ---
    console.log('[Test 11A] Transactional Rollback: Case creation fails when milestone insertion fails');
    const origRecordCaseMilestone = TimelineService.recordCaseCreatedMilestone;
    TimelineService.recordCaseCreatedMilestone = async () => {
      throw new Error('Simulated milestone failure for transactional rollback test');
    };

    let caseRollbackCaught = false;
    try {
      await CaseService.createCase({
        title: 'ROLLBACK_TEST_CASE: Should not persist',
        issue_category: 'GENERAL',
        claimed_amount: 1000,
        user_narrative: 'Testing atomic transaction rollback.',
      });
    } catch (err) {
      caseRollbackCaught = true;
      console.log(`[Test 11A] Caught expected error: ${err.message}`);
    } finally {
      TimelineService.recordCaseCreatedMilestone = origRecordCaseMilestone;
    }

    const [rolledBackCaseRows] = await pool.query(
      "SELECT COUNT(*) AS count FROM cases WHERE title LIKE 'ROLLBACK_TEST_CASE%'"
    );
    console.log(`[Test 11A] Cases persisted in MySQL: ${rolledBackCaseRows[0].count} (Expected: 0)`);
    if (!caseRollbackCaught || rolledBackCaseRows[0].count !== 0) {
      throw new Error('Case creation transaction rollback failed: row persisted despite failure');
    }
    console.log('PASS: Case creation atomic transaction rollback verified.');

    console.log('[Test 11B] Transactional Rollback: Document upload fails when milestone fails -> file unlinked & DB rolled back');
    const tempUploadPath = path.resolve('uploads', 'rollback_test_document.pdf');
    fs.writeFileSync(tempUploadPath, '%PDF-1.4\nRollback document test buffer\n%%EOF');
    const mockFile = {
      originalname: 'rollback_test_document.pdf',
      filename: 'rollback_test_document.pdf',
      path: tempUploadPath,
      mimetype: 'application/pdf',
      size: 29,
    };

    const origRecordDocMilestone = TimelineService.recordDocumentUploadMilestone;
    TimelineService.recordDocumentUploadMilestone = async () => {
      throw new Error('Simulated upload milestone failure for transactional rollback test');
    };

    let docRollbackCaught = false;
    try {
      await DocumentService.uploadDocument({
        caseId: caseAId,
        file: mockFile,
        documentType: 'TAX_INVOICE',
        description: 'Should be rolled back',
      });
    } catch (err) {
      docRollbackCaught = true;
      console.log(`[Test 11B] Caught expected error: ${err.message}`);
    } finally {
      TimelineService.recordDocumentUploadMilestone = origRecordDocMilestone;
    }

    const fileStillOnDisk = fs.existsSync(tempUploadPath);
    console.log(`[Test 11B] Physical file still on disk: ${fileStillOnDisk} (Expected: false)`);
    if (fileStillOnDisk) {
      try { fs.unlinkSync(tempUploadPath); } catch (e) { }
      throw new Error('Physical file was not unlinked upon transaction failure');
    }

    const [rolledBackDocRows] = await pool.query(
      "SELECT COUNT(*) AS count FROM case_documents WHERE original_filename = 'rollback_test_document.pdf'"
    );
    console.log(`[Test 11B] Documents persisted in MySQL: ${rolledBackDocRows[0].count} (Expected: 0)`);
    if (!docRollbackCaught || rolledBackDocRows[0].count !== 0) {
      throw new Error('Document upload transaction rollback failed: document row persisted');
    }
    console.log('PASS: Document upload transaction rollback and file unlink verified.\n');

    console.log('[Test 11C] Transactional Rollback: Evidence evaluation fails when milestone fails -> evaluation snapshot rolled back');
    const [evalCountBefore] = await pool.query(
      'SELECT COUNT(*) AS count FROM evidence_evaluations WHERE case_id = ?',
      [caseAId]
    );

    const origRecordEvalMilestone = TimelineService.recordEvidenceEvaluationMilestone;
    TimelineService.recordEvidenceEvaluationMilestone = async () => {
      throw new Error('Simulated evaluation milestone failure for transactional rollback test');
    };

    let evalRollbackCaught = false;
    try {
      await EvidenceService.evaluateCaseEvidence(caseAId);
    } catch (err) {
      evalRollbackCaught = true;
      console.log(`[Test 11C] Caught expected error: ${err.message}`);
    } finally {
      TimelineService.recordEvidenceEvaluationMilestone = origRecordEvalMilestone;
    }

    const [evalCountAfter] = await pool.query(
      'SELECT COUNT(*) AS count FROM evidence_evaluations WHERE case_id = ?',
      [caseAId]
    );
    console.log(`[Test 11C] Evaluations before: ${evalCountBefore[0].count} | after: ${evalCountAfter[0].count} (Expected: equal)`);

    if (!evalRollbackCaught || evalCountAfter[0].count !== evalCountBefore[0].count) {
      throw new Error('Evidence evaluation transaction rollback failed: evaluation row persisted');
    }
    console.log('PASS: Evidence evaluation transaction rollback verified.\n');

    // --- TEST 12: Direct MySQL Integrity Check ---
    console.log('[Test 12] Direct MySQL database inspection');
    const [dbEvents] = await pool.query('SELECT COUNT(*) AS count FROM case_timeline_events WHERE case_id = ?', [caseAId]);
    console.log(`Active timeline events in MySQL for Case A: ${dbEvents[0].count}`);
    if (dbEvents[0].count === 0) throw new Error('Expected active timeline events in MySQL');
    console.log('PASS: Direct MySQL integrity verified.\n');

    console.log('========================================================');
    console.log('       ALL 12 PHASE 5 TIMELINE SCENARIOS PASSED         ');
    console.log('========================================================\n');
  } catch (error) {
    console.error('\n[FATAL TEST FAILURE]:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  } finally {
    // Clean up created test cases and test files
    if (createdCaseIds.length > 0) {
      console.log(`[TEARDOWN] Cleaning up ${createdCaseIds.length} test cases...`);
      for (const id of createdCaseIds) {
        const [docs] = await pool.query('SELECT file_path FROM case_documents WHERE case_id = ?', [id]);
        for (const d of docs) {
          if (d.file_path && fs.existsSync(d.file_path)) {
            try {
              await fs.promises.unlink(d.file_path);
              console.log(`[TEARDOWN] Unlinked test file: ${path.basename(d.file_path)}`);
            } catch (e) { }
          }
        }
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

runPhase5TimelineTests();
