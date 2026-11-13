require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { app } = require('../server');
const pool = require('../src/config/db');

const TEST_PORT = 5097;

async function runPhase4BTests() {
  console.log('========================================================');
  console.log('   Graahak AI - Phase 4B Document Management Test Suite ');
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

    // --- SETUP: Create Test Cases ---
    console.log('[Setup] Creating Case A for document testing...');
    const caseARes = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TEST_CASE_A: Defective Laptop Motherboard',
        issue_category: 'DEFECTIVE_PRODUCT',
        merchant_name: 'Test Tech Superstore',
        claimed_amount: 85000.0,
        user_narrative: 'Laptop motherboard failed within warranty. Service center refusing replacement.',
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
        title: 'TEST_CASE_B: Delayed Refrigerator Delivery',
        issue_category: 'DELAYED_DELIVERY',
        merchant_name: 'Home Appliances Direct',
        claimed_amount: 32000.0,
        user_narrative: 'Refrigerator delivery delayed by 3 weeks beyond SLA.',
      }),
    });
    const caseBJson = await caseBRes.json();
    const caseBId = String(caseBJson.data.id);
    createdCaseIds.push(caseBId);
    console.log(`[Setup] Case B created with ID: ${caseBId}\n`);

    // --- TEST 1: Upload without file attachment ---
    console.log('[Test 1] POST /api/cases/:id/documents without file attachment');
    const emptyForm = new FormData();
    emptyForm.append('document_type', 'TAX_INVOICE');
    const noFileRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: emptyForm,
    });
    const noFileJson = await noFileRes.json();
    console.log(`Status: ${noFileRes.status} (Expected: 400)`);
    console.log(`Errors: ${JSON.stringify(noFileJson.errors)}`);
    if (noFileRes.status !== 400 || !noFileJson.errors) {
      throw new Error('Expected 400 when file attachment is missing');
    }
    console.log('PASS: Upload without file correctly rejected with 400.\n');

    // --- TEST 2: Upload with invalid file type (e.g. text/plain) ---
    console.log('[Test 2] POST /api/cases/:id/documents with invalid file format (.txt)');
    const invalidFileForm = new FormData();
    const textBlob = new Blob(['Plain text file content'], { type: 'text/plain' });
    invalidFileForm.append('file', textBlob, 'malicious.txt');
    invalidFileForm.append('document_type', 'TAX_INVOICE');

    const invalidFileRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: invalidFileForm,
    });
    const invalidFileJson = await invalidFileRes.json();
    console.log(`Status: ${invalidFileRes.status} (Expected: 400)`);
    console.log(`Error message: "${invalidFileJson.message}"`);
    if (invalidFileRes.status !== 400 || !invalidFileJson.message.includes('Invalid file type')) {
      throw new Error('Expected 400 when invalid file type is uploaded');
    }
    console.log('PASS: Invalid file format (.txt) correctly rejected with 400.\n');

    // --- TEST 3: Upload with invalid document_type & verify file cleanup ---
    console.log('[Test 3] POST /api/cases/:id/documents with invalid document_type');
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
    const filesBeforeTest3 = fs.readdirSync(uploadDir);

    const invalidTypeForm = new FormData();
    const validPdfBytes = Buffer.from('%PDF-1.4 sample PDF binary header');
    const pdfBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
    invalidTypeForm.append('file', pdfBlob, 'valid_invoice.pdf');
    invalidTypeForm.append('document_type', 'NON_EXISTENT_DOCUMENT_TYPE');

    const invalidTypeRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: invalidTypeForm,
    });
    const invalidTypeJson = await invalidTypeRes.json();
    console.log(`Status: ${invalidTypeRes.status} (Expected: 400)`);
    console.log(`Errors: ${JSON.stringify(invalidTypeJson.errors)}`);

    const filesAfterTest3 = fs.readdirSync(uploadDir);
    const leakedFilesTest3 = filesAfterTest3.filter((f) => !filesBeforeTest3.includes(f));
    console.log(`Orphaned files on disk after rejection: ${leakedFilesTest3.length}`);
    if (invalidTypeRes.status !== 400 || leakedFilesTest3.length > 0) {
      throw new Error('Expected 400 and zero leaked files when document_type is invalid');
    }
    console.log('PASS: Invalid document_type rejected and physical file cleaned up.\n');

    // --- TEST 4: Upload to nonexistent case ID ---
    console.log('[Test 4] POST /api/cases/99999999/documents (Nonexistent case)');
    const filesBeforeTest4 = fs.readdirSync(uploadDir);

    const nonExistentCaseForm = new FormData();
    const pdfBlob4 = new Blob([validPdfBytes], { type: 'application/pdf' });
    nonExistentCaseForm.append('file', pdfBlob4, 'orphan_candidate.pdf');
    nonExistentCaseForm.append('document_type', 'TAX_INVOICE');

    const nonExistentRes = await fetch(`${baseUrl}/api/cases/99999999/documents`, {
      method: 'POST',
      body: nonExistentCaseForm,
    });
    const nonExistentJson = await nonExistentRes.json();
    console.log(`Status: ${nonExistentRes.status} (Expected: 404)`);
    console.log(`Message: "${nonExistentJson.message}"`);

    const filesAfterTest4 = fs.readdirSync(uploadDir);
    const leakedFilesTest4 = filesAfterTest4.filter((f) => !filesBeforeTest4.includes(f));
    console.log(`Orphaned files on disk after 404: ${leakedFilesTest4.length}`);
    if (nonExistentRes.status !== 404 || leakedFilesTest4.length > 0) {
      throw new Error('Expected 404 and zero leaked files when case does not exist');
    }
    console.log('PASS: Upload to nonexistent case returned 404 and cleaned up file.\n');

    // --- TEST 5: Successful Upload 1 (PDF Tax Invoice) ---
    console.log('[Test 5] POST /api/cases/:id/documents - Successful PDF Upload (TAX_INVOICE)');
    const validForm1 = new FormData();
    const invoicePdfContent = Buffer.from('%PDF-1.4 official retail invoice sample stream');
    const invoiceBlob = new Blob([invoicePdfContent], { type: 'application/pdf' });
    validForm1.append('file', invoiceBlob, 'laptop_tax_invoice.pdf');
    validForm1.append('document_type', 'TAX_INVOICE');
    validForm1.append('description', 'Official retail tax invoice with GSTIN and serial number');

    const upload1Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: validForm1,
    });
    const upload1Json = await upload1Res.json();
    console.log(`Status: ${upload1Res.status} (Expected: 201)`);
    console.log(`Created Document ID: ${upload1Json.data?.id}`);
    console.log(`Document Type: ${upload1Json.data?.document_type}`);
    console.log(`Exposed file_path in response? ${upload1Json.data?.file_path !== undefined}`);

    if (
      upload1Res.status !== 201 ||
      !upload1Json.data?.id ||
      upload1Json.data.document_type !== 'TAX_INVOICE' ||
      upload1Json.data.file_path !== undefined
    ) {
      throw new Error('Failed to upload TAX_INVOICE or leaked internal file_path');
    }
    const doc1Id = String(upload1Json.data.id);

    // Direct MySQL verification
    const [dbDoc1] = await pool.query('SELECT * FROM case_documents WHERE id = ?', [doc1Id]);
    console.log(`MySQL Record Found: ${dbDoc1.length === 1}`);
    console.log(`Stored in DB: "${dbDoc1[0]?.original_filename}" | Type: ${dbDoc1[0]?.document_type}`);
    console.log(`Physical file exists: ${fs.existsSync(dbDoc1[0]?.file_path)}`);
    filesToClean.push(dbDoc1[0]?.file_path);

    if (dbDoc1.length !== 1 || !fs.existsSync(dbDoc1[0]?.file_path)) {
      throw new Error('Database record or physical file missing after successful upload');
    }
    console.log('PASS: Successful PDF upload verified in MySQL and filesystem.\n');

    // --- TEST 6: Successful Upload 2 (PNG Defect Evidence) ---
    console.log('[Test 6] POST /api/cases/:id/documents - Successful PNG Upload (DEFECT_EVIDENCE)');
    const validForm2 = new FormData();
    const pngContent = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); // PNG magic bytes
    const pngBlob = new Blob([pngContent], { type: 'image/png' });
    validForm2.append('file', pngBlob, 'motherboard_burn.png');
    validForm2.append('document_type', 'DEFECT_EVIDENCE');
    validForm2.append('description', 'Burn marks on VRM area of motherboard');

    const upload2Res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      body: validForm2,
    });
    const upload2Json = await upload2Res.json();
    console.log(`Status: ${upload2Res.status} (Expected: 201)`);
    console.log(`Created Document ID: ${upload2Json.data?.id}`);
    console.log(`Document Type: ${upload2Json.data?.document_type}`);

    if (upload2Res.status !== 201 || !upload2Json.data?.id || upload2Json.data.document_type !== 'DEFECT_EVIDENCE') {
      throw new Error('Failed to upload DEFECT_EVIDENCE');
    }
    const doc2Id = String(upload2Json.data.id);

    const [dbDoc2] = await pool.query('SELECT * FROM case_documents WHERE id = ?', [doc2Id]);
    filesToClean.push(dbDoc2[0]?.file_path);
    console.log('PASS: Second document upload (PNG) verified successfully.\n');

    // --- TEST 7: List Case Documents (GET /api/cases/:id/documents) ---
    console.log('[Test 7] GET /api/cases/:id/documents');
    const listDocsRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`);
    const listDocsJson = await listDocsRes.json();
    console.log(`Status: ${listDocsRes.status} (Expected: 200)`);
    console.log(`Documents count: ${listDocsJson.data?.length}`);

    const hasLeakedPaths = listDocsJson.data.some((d) => d.file_path !== undefined);
    console.log(`Any internal file_path leaked in list: ${hasLeakedPaths}`);

    if (listDocsRes.status !== 200 || listDocsJson.data.length !== 2 || hasLeakedPaths) {
      throw new Error('Document listing failed or leaked internal file paths');
    }
    console.log('PASS: Document listing verified and secure.\n');

    // --- TEST 8: Cross-Case Deletion Protection (IDOR Defense) ---
    console.log('[Test 8] Cross-case deletion protection: Case B attempts to delete Case A document');
    const crossDeleteRes = await fetch(`${baseUrl}/api/cases/${caseBId}/documents/${doc1Id}`, {
      method: 'DELETE',
    });
    const crossDeleteJson = await crossDeleteRes.json();
    console.log(`Status: ${crossDeleteRes.status} (Expected: 404)`);
    console.log(`Message: "${crossDeleteJson.message}"`);

    // Verify document was NOT deleted
    const [dbDocStillExists] = await pool.query('SELECT * FROM case_documents WHERE id = ?', [doc1Id]);
    console.log(`Document still in MySQL: ${dbDocStillExists.length === 1}`);
    console.log(`Physical file still intact: ${fs.existsSync(dbDoc1[0]?.file_path)}`);

    if (crossDeleteRes.status !== 404 || dbDocStillExists.length !== 1 || !fs.existsSync(dbDoc1[0]?.file_path)) {
      throw new Error('Cross-case deletion security check failed!');
    }
    console.log('PASS: Cross-case deletion prevented with 404 and data intact.\n');

    // --- TEST 9: Successful Document Deletion ---
    console.log(`[Test 9] DELETE /api/cases/${caseAId}/documents/${doc1Id}`);
    const deleteRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${doc1Id}`, {
      method: 'DELETE',
    });
    const deleteJson = await deleteRes.json();
    console.log(`Status: ${deleteRes.status} (Expected: 200)`);
    console.log(`Deleted result: ${JSON.stringify(deleteJson.data)}`);

    // Verify row deleted from MySQL
    const [dbDocAfterDelete] = await pool.query('SELECT * FROM case_documents WHERE id = ?', [doc1Id]);
    console.log(`MySQL Row Deleted: ${dbDocAfterDelete.length === 0}`);

    // Verify file unlinked from disk
    const fileExistsAfterDelete = fs.existsSync(dbDoc1[0]?.file_path);
    console.log(`Physical file unlinked from disk: ${!fileExistsAfterDelete}`);

    if (deleteRes.status !== 200 || dbDocAfterDelete.length !== 0 || fileExistsAfterDelete) {
      throw new Error('Failed to delete document or file remained on disk');
    }
    console.log('PASS: Successful deletion verified in database and filesystem.\n');

    // --- TEST 10: Safe Deletion Handling when file already missing on disk (ENOENT) ---
    console.log('[Test 10] Deletion with missing physical file on disk (ENOENT handling)');
    // Manually unlink doc2 file first
    if (fs.existsSync(dbDoc2[0]?.file_path)) {
      fs.unlinkSync(dbDoc2[0]?.file_path);
      console.log(`[Test 10 Setup] Manually unlinked file before API call: ${!fs.existsSync(dbDoc2[0]?.file_path)}`);
    }

    const deleteEnoentRes = await fetch(`${baseUrl}/api/cases/${caseAId}/documents/${doc2Id}`, {
      method: 'DELETE',
    });
    const deleteEnoentJson = await deleteEnoentRes.json();
    console.log(`Status: ${deleteEnoentRes.status} (Expected: 200)`);
    console.log(`Message: "${deleteEnoentJson.message}"`);

    const [dbDoc2After] = await pool.query('SELECT * FROM case_documents WHERE id = ?', [doc2Id]);
    console.log(`MySQL Row Deleted despite missing file: ${dbDoc2After.length === 0}`);

    if (deleteEnoentRes.status !== 200 || dbDoc2After.length !== 0) {
      throw new Error('Failed to handle ENOENT gracefully during document deletion');
    }
    console.log('PASS: ENOENT safely handled; database cleaned up gracefully.\n');

    console.log('========================================================');
    console.log('       ALL 10 PHASE 4B TEST SCENARIOS PASSED            ');
    console.log('========================================================\n');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Teardown: Delete all created test cases (cascades to case_documents)
    if (createdCaseIds.length > 0) {
      console.log(`[TEARDOWN] Cleaning up ${createdCaseIds.length} test cases...`);
      for (const id of createdCaseIds) {
        await pool.query('DELETE FROM cases WHERE id = ?', [id]);
        console.log(`[TEARDOWN] Deleted test case ID: ${id}`);
      }
    }

    // Teardown: Clean up any test files that might remain on disk
    for (const f of filesToClean) {
      if (f && fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
          console.log(`[TEARDOWN] Unlinked residual test file: ${path.basename(f)}`);
        } catch (e) {
          // ignore
        }
      }
    }

    if (server) {
      server.close();
      console.log('[TEST] Test server stopped.');
    }
    await pool.end();
  }
}

runPhase4BTests();
