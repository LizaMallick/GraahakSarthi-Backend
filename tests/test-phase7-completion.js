require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 1. Isolate test uploads in a unique, process-specific sandbox directory BEFORE loading server / Multer
const runSuffix = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const TEST_UPLOAD_DIR = path.resolve(__dirname, `../uploads/test-phase7-sandbox-${runSuffix}`);
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;

// Ensure sandbox directory exists before any upload operations
if (!fs.existsSync(TEST_UPLOAD_DIR)) {
  fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });
}

const { app } = require('../server');
const pool = require('../src/config/db');

const TEST_PORT = 5092;

async function runPhase7Tests() {
  console.log('========================================================');
  console.log('   Graahak AI - Phase 7 Case & Document API Suite       ');
  console.log('========================================================\n');

  let passedScenarios = 0;
  let totalScenarios = 14;
  const createdCaseIds = [];
  const residualFiles = [];
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
    const uploadDir = TEST_UPLOAD_DIR;

    // --- SETUP: Create Test Cases ---
    console.log('[Setup] Creating Case A for document & deletion testing...');
    const caseARes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_P7_A: Defective Smart TV Panel',
        issue_category: 'DEFECTIVE_PRODUCT',
        merchant_name: 'ElectroMart India',
        claimed_amount: 45000.0,
        user_narrative: 'Smart TV panel malfunctioned with vertical lines within warranty period.',
      }),
    });
    const caseAJson = await caseARes.json();
    const caseAId = String(caseAJson.data.id);
    createdCaseIds.push(caseAId);
    console.log(`[Setup] Case A created with ID: ${caseAId}`);

    console.log('[Setup] Creating Case B for cross-case security checks...');
    const caseBRes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_P7_B: Delayed Delivery Washing Machine',
        issue_category: 'DELAYED_DELIVERY',
        merchant_name: 'Appliance Hub',
        claimed_amount: 28000.0,
        user_narrative: 'Washing machine delivery delayed by one month beyond guaranteed date.',
      }),
    });
    const caseBJson = await caseBRes.json();
    const caseBId = String(caseBJson.data.id);
    createdCaseIds.push(caseBId);
    console.log(`[Setup] Case B created with ID: ${caseBId}\n`);

    // =========================================================================
    // SCENARIO 1: Upload with forged file signature (MIME pdf, content text)
    // =========================================================================
    console.log('--- Scenario 1: Forged File Signature Rejection (Fake PDF) ---');
    const filesBeforeS1 = fs.readdirSync(uploadDir);

    const forgedPdfBytes = Buffer.from('THIS IS PLAIN TEXT NOT A REAL PDF FILE HEADER');
    const forgedPdfBlob = new Blob([forgedPdfBytes], { type: 'application/pdf' });
    const forgedForm = new FormData();
    forgedForm.append('file', forgedPdfBlob, 'fake_invoice.pdf');
    forgedForm.append('document_type', 'TAX_INVOICE');

    const s1Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: forgedForm,
    });
    const s1Json = await s1Res.json();
    console.log(`Status: ${s1Res.status} (Expected: 400)`);
    console.log(`Errors: ${JSON.stringify(s1Json.errors)}`);

    const filesAfterS1 = fs.readdirSync(uploadDir);
    const leakedFilesS1 = filesAfterS1.filter((f) => !filesBeforeS1.includes(f));
    console.log(`Leaked files on disk after rejection: ${leakedFilesS1.length} (Expected: 0)`);

    if (
      s1Res.status !== 400 ||
      !Array.isArray(s1Json.errors) ||
      !s1Json.errors.some((e) => e.includes('Invalid file content signature')) ||
      leakedFilesS1.length > 0
    ) {
      throw new Error('Scenario 1 Failed: Forged PDF was not rejected with signature error or leaked file.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 1 - Forged PDF signature rejected and disk cleaned up.\n');

    // =========================================================================
    // SCENARIO 2: Upload with forged WebP signature (MIME webp, content text)
    // =========================================================================
    console.log('--- Scenario 2: Forged File Signature Rejection (Fake WebP) ---');
    const filesBeforeS2 = fs.readdirSync(uploadDir);

    const forgedWebpBytes = Buffer.from('NOT A WEBP FILE AT ALL');
    const forgedWebpBlob = new Blob([forgedWebpBytes], { type: 'image/webp' });
    const forgedWebpForm = new FormData();
    forgedWebpForm.append('file', forgedWebpBlob, 'fake_photo.webp');
    forgedWebpForm.append('document_type', 'DEFECT_EVIDENCE');

    const s2Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: forgedWebpForm,
    });
    const s2Json = await s2Res.json();
    console.log(`Status: ${s2Res.status} (Expected: 400)`);
    console.log(`Errors: ${JSON.stringify(s2Json.errors)}`);

    const filesAfterS2 = fs.readdirSync(uploadDir);
    const leakedFilesS2 = filesAfterS2.filter((f) => !filesBeforeS2.includes(f));
    console.log(`Leaked files on disk after rejection: ${leakedFilesS2.length} (Expected: 0)`);

    if (
      s2Res.status !== 400 ||
      !Array.isArray(s2Json.errors) ||
      !s2Json.errors.some((e) => e.includes('Invalid file content signature')) ||
      leakedFilesS2.length > 0
    ) {
      throw new Error('Scenario 2 Failed: Forged WebP was not rejected with signature error or leaked file.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 2 - Forged WebP signature rejected and disk cleaned up.\n');

    // =========================================================================
    // SCENARIO 3: Valid WebP Upload with genuine magic bytes
    // =========================================================================
    console.log('--- Scenario 3: Valid WebP Upload (Genuine RIFF....WEBP) ---');
    // Minimal valid WebP binary header
    const validWebpBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x18, 0x00, 0x00, 0x00, // file length - 8 (24 bytes)
      0x57, 0x45, 0x42, 0x50, // "WEBP"
      0x56, 0x50, 0x38, 0x20, // "VP8 "
      0x0c, 0x00, 0x00, 0x00, // chunk size
      0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
    ]);
    const validWebpBlob = new Blob([validWebpBytes], { type: 'image/webp' });
    const validWebpForm = new FormData();
    validWebpForm.append('file', validWebpBlob, 'tv_defect_screen.webp');
    validWebpForm.append('document_type', 'DEFECT_EVIDENCE');
    validWebpForm.append('description', 'Photo showing vertical line defect on TV screen');

    const s3Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: validWebpForm,
    });
    const s3Json = await s3Res.json();
    console.log(`Status: ${s3Res.status} (Expected: 201)`);
    console.log(`Document ID: ${s3Json.data?.id}`);
    console.log(`MIME Type: ${s3Json.data?.mime_type} (Expected: image/webp)`);
    console.log(`File Path exposed?: ${s3Json.data?.file_path !== undefined} (Expected: false)`);

    const webpDocId = String(s3Json.data.id);
    if (
      s3Res.status !== 201 ||
      s3Json.data.mime_type !== 'image/webp' ||
      s3Json.data.document_type !== 'DEFECT_EVIDENCE' ||
      s3Json.data.file_path !== undefined
    ) {
      throw new Error('Scenario 3 Failed: Valid WebP upload did not return 201 with sanitized response.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 3 - Genuine WebP uploaded successfully with metadata sanitized.\n');

    // =========================================================================
    // SCENARIO 4: Valid PDF Upload with genuine magic bytes
    // =========================================================================
    console.log('--- Scenario 4: Valid PDF Upload (Genuine %PDF-) ---');
    const validPdfBytes = Buffer.from('%PDF-1.4\n%genuine pdf content for invoice testing\n%%EOF');
    const validPdfBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
    const validPdfForm = new FormData();
    validPdfForm.append('file', validPdfBlob, 'tv_invoice.pdf');
    validPdfForm.append('document_type', 'TAX_INVOICE');
    validPdfForm.append('description', 'Original tax invoice from ElectroMart');

    const s4Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: validPdfForm,
    });
    const s4Json = await s4Res.json();
    console.log(`Status: ${s4Res.status} (Expected: 201)`);
    console.log(`Document ID: ${s4Json.data?.id}`);
    console.log(`MIME Type: ${s4Json.data?.mime_type} (Expected: application/pdf)`);
    console.log(`File Path exposed?: ${s4Json.data?.file_path !== undefined} (Expected: false)`);

    const pdfDocId = String(s4Json.data.id);
    if (
      s4Res.status !== 201 ||
      s4Json.data.mime_type !== 'application/pdf' ||
      s4Json.data.document_type !== 'TAX_INVOICE' ||
      s4Json.data.file_path !== undefined
    ) {
      throw new Error('Scenario 4 Failed: Valid PDF upload did not return 201 with sanitized response.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 4 - Genuine PDF uploaded successfully with metadata sanitized.\n');

    // =========================================================================
    // SCENARIO 5: Document Preview Streaming (GET .../file without download query)
    // =========================================================================
    console.log('--- Scenario 5: Document Preview Streaming (Inline Mode) ---');
    const s5Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${webpDocId}/file`);
    const s5ContentType = s5Res.headers.get('content-type');
    const s5ContentDisp = s5Res.headers.get('content-disposition');
    const s5Buffer = Buffer.from(await s5Res.arrayBuffer());

    console.log(`Status: ${s5Res.status} (Expected: 200)`);
    console.log(`Content-Type: ${s5ContentType} (Expected: image/webp)`);
    console.log(`Content-Disposition: ${s5ContentDisp} (Expected inline...)`);
    console.log(`Binary size matches uploaded: ${s5Buffer.length === validWebpBytes.length} (${s5Buffer.length} bytes)`);

    if (
      s5Res.status !== 200 ||
      s5ContentType !== 'image/webp' ||
      !s5ContentDisp.startsWith('inline;') ||
      !s5Buffer.equals(validWebpBytes)
    ) {
      throw new Error('Scenario 5 Failed: Document preview streaming headers or payload mismatch.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 5 - Document preview streams binary with inline disposition.\n');

    // =========================================================================
    // SCENARIO 6: Document Download Streaming (GET .../file?download=true)
    // =========================================================================
    console.log('--- Scenario 6: Document Download Streaming (Attachment Mode) ---');
    const s6Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${pdfDocId}/file?download=true`);
    const s6ContentType = s6Res.headers.get('content-type');
    const s6ContentDisp = s6Res.headers.get('content-disposition');
    const s6Buffer = Buffer.from(await s6Res.arrayBuffer());

    console.log(`Status: ${s6Res.status} (Expected: 200)`);
    console.log(`Content-Type: ${s6ContentType} (Expected: application/pdf)`);
    console.log(`Content-Disposition: ${s6ContentDisp} (Expected attachment...)`);
    console.log(`Binary size matches uploaded: ${s6Buffer.length === validPdfBytes.length} (${s6Buffer.length} bytes)`);

    if (
      s6Res.status !== 200 ||
      s6ContentType !== 'application/pdf' ||
      !s6ContentDisp.startsWith('attachment;') ||
      !s6Buffer.equals(validPdfBytes)
    ) {
      throw new Error('Scenario 6 Failed: Document download streaming headers or payload mismatch.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 6 - Document download streams binary with attachment disposition.\n');

    // =========================================================================
    // SCENARIO 7: Cross-Case IDOR Access Defense
    // =========================================================================
    console.log('--- Scenario 7: IDOR Defense (Cross-Case Document Access Rejection) ---');
    // Case B tries to access Case A's document file
    const s7ResFile = await fetch(`${baseUrl}/api/cases/${caseBId}/documents/${webpDocId}/file`);
    const s7JsonFile = await s7ResFile.json();
    console.log(`File Access Cross-Case Status: ${s7ResFile.status} (Expected: 404)`);
    console.log(`File Access Error: "${s7JsonFile.message}"`);

    // Case B tries to PATCH Case A's document metadata
    const s7ResPatch = await fetch(`${baseUrl}/api/cases/${caseBId}/documents/${webpDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: 'PAYMENT_RECEIPT' }),
    });
    const s7JsonPatch = await s7ResPatch.json();
    console.log(`Metadata Patch Cross-Case Status: ${s7ResPatch.status} (Expected: 404)`);
    console.log(`Metadata Patch Error: "${s7JsonPatch.message}"`);

    if (
      s7ResFile.status !== 404 ||
      !s7JsonFile.message.includes(`does not belong to case ${caseBId}`) ||
      s7ResPatch.status !== 404 ||
      !s7JsonPatch.message.includes(`does not belong to case ${caseBId}`)
    ) {
      throw new Error('Scenario 7 Failed: Cross-case document access was not rejected with 404 ownership violation.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 7 - Cross-case document access strictly blocked with 404.\n');

    // =========================================================================
    // SCENARIO 8: Document Metadata Update (PATCH /api/cases/:id/documents/:docId)
    // =========================================================================
    console.log('--- Scenario 8: Document Metadata Update (PATCH Success) ---');
    const patchPayload = {
      document_type: 'PAYMENT_RECEIPT',
      description: 'Updated description: Official tax invoice & payment receipt',
    };
    const s8Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${pdfDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchPayload),
    });
    const s8Json = await s8Res.json();
    console.log(`Status: ${s8Res.status} (Expected: 200)`);
    console.log(`Updated document_type: ${s8Json.data?.document_type} (Expected: PAYMENT_RECEIPT)`);
    console.log(`Updated description: "${s8Json.data?.description}"`);
    console.log(`File Path exposed?: ${s8Json.data?.file_path !== undefined} (Expected: false)`);

    if (
      s8Res.status !== 200 ||
      s8Json.data.document_type !== 'PAYMENT_RECEIPT' ||
      s8Json.data.description !== patchPayload.description ||
      s8Json.data.file_path !== undefined
    ) {
      throw new Error('Scenario 8 Failed: Document metadata update did not return 200 with updated fields.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 8 - Document metadata successfully updated with file_path sanitized.\n');

    // =========================================================================
    // SCENARIO 9: Document Metadata Update Validation (Immutable & Invalid Fields)
    // =========================================================================
    console.log('--- Scenario 9: Document Metadata Update Validation ---');
    // 9a. Immutable field injection attempt
    const s9aRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${pdfDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: '/etc/passwd' }),
    });
    const s9aJson = await s9aRes.json();
    console.log(`Immutable field status: ${s9aRes.status} (Expected: 400)`);
    console.log(`Errors: ${JSON.stringify(s9aJson.errors)}`);

    // 9b. Invalid document_type
    const s9bRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${pdfDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: 'FORGED_RECEIPT_TYPE' }),
    });
    const s9bJson = await s9bRes.json();
    console.log(`Invalid doc type status: ${s9bRes.status} (Expected: 400)`);

    // 9c. Empty payload
    const s9cRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${pdfDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const s9cJson = await s9cRes.json();
    console.log(`Empty payload status: ${s9cRes.status} (Expected: 400)`);

    if (s9aRes.status !== 400 || s9bRes.status !== 400 || s9cRes.status !== 400) {
      throw new Error('Scenario 9 Failed: Validation did not properly reject immutable, invalid or empty update payloads.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 9 - Immutable fields and invalid document updates rejected with 400.\n');

    // =========================================================================
    // SCENARIO 10: Missing File on Disk Handling (ENOENT Defense)
    // =========================================================================
    console.log('--- Scenario 10: Missing Physical File on Disk Handling ---');
    // Upload a temporary document to Case B
    const tempPdfBytes = Buffer.from('%PDF-1.4 temporary document for missing file test\n%%EOF');
    const tempPdfBlob = new Blob([tempPdfBytes], { type: 'application/pdf' });
    const tempForm = new FormData();
    tempForm.append('file', tempPdfBlob, 'temp_file.pdf');
    tempForm.append('document_type', 'TAX_INVOICE');

    const tempUploadRes = await fetch(`${baseUrl}/api/cases/${caseBId}/documents`, {
      method: 'POST',
      body: tempForm,
    });
    const tempUploadJson = await tempUploadRes.json();
    const tempDocId = String(tempUploadJson.data.id);

    // Retrieve file_path from DB to delete it directly from disk
    const [tempDbRows] = await pool.query('SELECT file_path FROM case_documents WHERE id = ?', [tempDocId]);
    const physicalPath = tempDbRows[0].file_path;
    console.log(`Unlinking physical file: ${physicalPath}`);
    if (fs.existsSync(physicalPath)) {
      fs.unlinkSync(physicalPath);
    }

    // Now try to GET the document file
    const s10Res = await fetch(`${baseUrl}/api/cases/${caseBId}/documents/${tempDocId}/file`);
    const s10Json = await s10Res.json();
    console.log(`Status: ${s10Res.status} (Expected: 404)`);
    console.log(`Message: "${s10Json.message}"`);

    if (s10Res.status !== 404 || !s10Json.message.includes('missing from disk')) {
      throw new Error('Scenario 10 Failed: Missing file on disk did not return 404.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 10 - Missing physical file safely handled with 404.\n');

    // =========================================================================
    // SCENARIO 11: Invalid ID Parameters Validation
    // =========================================================================
    console.log('--- Scenario 11: Invalid ID Parameter Format Validation ---');
    const s11DeleteRes = await fetch(`${baseUrl}/api/cases/not_an_id`, { method: 'DELETE' });
    console.log(`Invalid case ID for delete: ${s11DeleteRes.status} (Expected: 400)`);

    const s11GetFileRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/not_an_id/file`);
    console.log(`Invalid doc ID for get file: ${s11GetFileRes.status} (Expected: 400)`);

    const s11PatchRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/not_an_id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: 'TAX_INVOICE' }),
    });
    console.log(`Invalid doc ID for patch: ${s11PatchRes.status} (Expected: 400)`);

    if (s11DeleteRes.status !== 400 || s11GetFileRes.status !== 400 || s11PatchRes.status !== 400) {
      throw new Error('Scenario 11 Failed: Non-numeric IDs were not rejected with 400.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 11 - Non-numeric IDs rejected with 400.\n');

    // =========================================================================
    // SCENARIO 12: Delete Non-Existent Case
    // =========================================================================
    console.log('--- Scenario 12: Delete Non-Existent Case (404) ---');
    const s12Res = await fetch(`${baseUrl}/api/cases/99999999`, { method: 'DELETE' });
    const s12Json = await s12Res.json();
    console.log(`Status: ${s12Res.status} (Expected: 404)`);
    console.log(`Message: "${s12Json.message}"`);

    if (s12Res.status !== 404 || !s12Json.message.includes('not found')) {
      throw new Error('Scenario 12 Failed: Deleting non-existent case did not return 404.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 12 - Deletion of non-existent case rejected with 404.\n');

    // =========================================================================
    // SCENARIO 13: Full Case Deletion with DB Cascade & Physical File Cleanup
    // =========================================================================
    console.log('--- Scenario 13: Full Case Deletion (Cascade & Physical File Cleanup) ---');
    // Attach child records to Case A: Timeline Event & Loss Calculation
    await fetch(`${baseUrl}/api/cases/${caseAId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_title: 'Notice Sent to ElectroMart',
        event_description: 'Formal legal notice dispatched via registered post',
        event_type: 'USER_ACTION',
        event_date: '2026-11-10',
      }),
    });

    await fetch(`${baseUrl}/api/cases/${caseAId}/loss-calculator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_amount: 45000,
        repair_replacement_expenses: 5000,
        annual_interest_rate: 9,
        interest_start_date: '2026-06-01',
      }),
    });

    // Query physical file paths before deletion
    const [caseADocsBefore] = await pool.query(
      'SELECT id, file_path FROM case_documents WHERE case_id = ?',
      [caseAId]
    );
    console.log(`Case A document count before deletion: ${caseADocsBefore.length}`);
    const filesToVerifyUnlinked = caseADocsBefore.map((d) => d.file_path);
    filesToVerifyUnlinked.forEach((fp) => {
      console.log(`Pre-deletion file exists: ${fs.existsSync(fp)} (${path.basename(fp)})`);
    });

    // Execute DELETE /api/cases/:id
    const s13Res = await fetch(`${baseUrl}/api/cases/${caseAId}`, {
      method: 'DELETE',
    });
    const s13Json = await s13Res.json();
    console.log(`Status: ${s13Res.status} (Expected: 200)`);
    console.log(`Message: "${s13Json.message}"`);
    console.log(`Data: ${JSON.stringify(s13Json.data)}`);

    // Verify MySQL Cascade: Case table
    const [caseCheck] = await pool.query('SELECT id FROM cases WHERE id = ?', [caseAId]);
    // Verify MySQL Cascade: case_documents table
    const [docsCheck] = await pool.query('SELECT id FROM case_documents WHERE case_id = ?', [caseAId]);
    // Verify MySQL Cascade: case_timeline_events table
    const [timelineCheck] = await pool.query('SELECT id FROM case_timeline_events WHERE case_id = ?', [caseAId]);
    // Verify MySQL Cascade: case_loss_calculations table
    const [lossCheck] = await pool.query('SELECT id FROM case_loss_calculations WHERE case_id = ?', [caseAId]);

    console.log(`MySQL cases row remaining: ${caseCheck.length} (Expected: 0)`);
    console.log(`MySQL case_documents rows remaining: ${docsCheck.length} (Expected: 0)`);
    console.log(`MySQL case_timeline_events rows remaining: ${timelineCheck.length} (Expected: 0)`);
    console.log(`MySQL case_loss_calculations rows remaining: ${lossCheck.length} (Expected: 0)`);

    // Verify Physical Files Unlinked from Disk
    const remainingFiles = filesToVerifyUnlinked.filter((fp) => fs.existsSync(fp));
    console.log(`Physical files remaining on disk: ${remainingFiles.length} (Expected: 0)`);

    if (
      s13Res.status !== 200 ||
      !s13Json.data?.deleted ||
      s13Json.data.files_unlinked < 2 ||
      caseCheck.length !== 0 ||
      docsCheck.length !== 0 ||
      timelineCheck.length !== 0 ||
      lossCheck.length !== 0 ||
      remainingFiles.length !== 0
    ) {
      throw new Error('Scenario 13 Failed: Case deletion did not cascade DB records or unlink physical files.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 13 - Case, child records, and physical files successfully deleted.\n');

    // Remove Case A from createdCaseIds since it's already deleted
    const caseAIdx = createdCaseIds.indexOf(caseAId);
    if (caseAIdx > -1) createdCaseIds.splice(caseAIdx, 1);

    // =========================================================================
    // SCENARIO 14: Post-Deletion Verification (GET /api/cases/:id returns 404)
    // =========================================================================
    console.log('--- Scenario 14: Verify Deleted Case Cannot Be Queried ---');
    const s14Res = await fetch(`${baseUrl}/api/cases/${caseAId}`);
    const s14Json = await s14Res.json();
    console.log(`Status: ${s14Res.status} (Expected: 404)`);
    console.log(`Message: "${s14Json.message}"`);

    if (s14Res.status !== 404) {
      throw new Error('Scenario 14 Failed: Deleted case was still accessible.');
    }
    passedScenarios++;
    console.log('PASS: Scenario 14 - Deleted case confirmed inaccessible with 404.\n');

    console.log('========================================================');
    console.log(`       ALL ${passedScenarios} OF ${totalScenarios} PHASE 7 TEST SCENARIOS PASSED`);
    console.log('========================================================\n');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Teardown: Delete all created test cases
    if (createdCaseIds.length > 0) {
      console.log(`[TEARDOWN] Cleaning up ${createdCaseIds.length} remaining test cases...`);
      for (const id of createdCaseIds) {
        try {
          // Query files first to unlink them
          const [docs] = await pool.query('SELECT file_path FROM case_documents WHERE case_id = ?', [id]);
          for (const d of docs) {
            if (d.file_path && fs.existsSync(d.file_path)) {
              try { fs.unlinkSync(d.file_path); } catch (e) {}
            }
          }
          await pool.query('DELETE FROM cases WHERE id = ?', [id]);
          console.log(`[TEARDOWN] Deleted test case ID: ${id}`);
        } catch (e) {
          console.warn(`[TEARDOWN Warning] Failed to clean up case ID ${id}:`, e.message);
        }
      }
    }

    // Teardown: Clean up residual files
    for (const f of residualFiles) {
      if (f && fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
          console.log(`[TEARDOWN] Cleaned residual file: ${path.basename(f)}`);
        } catch (e) {}
      }
    }

    // Teardown: Safely remove only the exact unique TEST_UPLOAD_DIR sandbox directory
    if (fs.existsSync(TEST_UPLOAD_DIR)) {
      try {
        fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
        console.log(`[TEARDOWN] Removed unique sandbox upload directory: ${TEST_UPLOAD_DIR}`);
      } catch (rmErr) {
        console.warn(`[TEARDOWN Warning] Failed to remove sandbox directory:`, rmErr.message);
      }
    }

    // Teardown: Stop HTTP server (await callback completion)
    if (server) {
      try {
        await new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        console.log('[TEARDOWN] Test server stopped successfully.');
      } catch (serverErr) {
        console.error('[TEARDOWN Error] Failed to stop test server cleanly:', serverErr.message);
      }
    }

    // Teardown: Close database pool
    try {
      await pool.end();
      console.log('[TEARDOWN] Database pool closed successfully.');
    } catch (poolErr) {
      console.error('[TEARDOWN Error] Failed to close database pool:', poolErr.message);
    }
  }
}

runPhase7Tests();
