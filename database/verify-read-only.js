/**
 * Strictly Read-Only System State & Residual Records Audit
 * Workspace: D:\GraahakSarthi-Backend
 *
 * Guarantees:
 * - Read-only SELECT queries only.
 * - Read-only filesystem inspection (fs.readdirSync).
 * - ZERO modifications, deletions, truncations, or unlinks.
 */

const pool = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function runReadOnlyAudit() {
  try {
    console.log('========================================================');
    console.log('       STRICTLY READ-ONLY SYSTEM & DATABASE AUDIT       ');
    console.log('========================================================\n');

    // 1. Verify active database
    const [dbResult] = await pool.query('SELECT DATABASE() AS active_db');
    const activeDb = dbResult[0].active_db;
    console.log(`[1] Active Database Connection: ${activeDb}`);

    if (activeDb !== 'graahak_ai') {
      console.error(`[SECURITY HALT] Connected to '${activeDb}' instead of 'graahak_ai'.`);
      return;
    }

    // 2. Read-only row counts across all relevant tables
    const [cases] = await pool.query('SELECT COUNT(*) AS count FROM cases');
    const [docs] = await pool.query('SELECT COUNT(*) AS count FROM case_documents');
    const [evals] = await pool.query('SELECT COUNT(*) AS count FROM evidence_evaluations');
    const [timeline] = await pool.query('SELECT COUNT(*) AS count FROM case_timeline_events');

    console.log('\n[2] Database Table Row Counts:');
    console.log(`  - cases:                  ${cases[0].count}`);
    console.log(`  - case_documents:         ${docs[0].count}`);
    console.log(`  - evidence_evaluations:   ${evals[0].count}`);
    console.log(`  - case_timeline_events:   ${timeline[0].count}`);

    // If any records exist, inspect them without modifying
    if (cases[0].count > 0) {
      const [sampleCases] = await pool.query('SELECT id, title, issue_category, status, created_at FROM cases LIMIT 5');
      console.log('\n  [Notice] Existing case records found (first 5):', sampleCases);
    }

    if (docs[0].count > 0) {
      const [sampleDocs] = await pool.query('SELECT id, case_id, document_type, original_filename, file_size FROM case_documents LIMIT 5');
      console.log('\n  [Notice] Existing case documents found (first 5):', sampleDocs);
    }

    // 3. Inspect uploads directory (read-only directory scan)
    const uploadsDir = path.resolve(__dirname, '../uploads');
    const files = fs.readdirSync(uploadsDir);

    console.log('\n[3] Filesystem Inspection (uploads/):');
    console.log(`  - Target Directory: ${uploadsDir}`);
    console.log(`  - Total items present: ${files.length}`);
    console.log(`  - Items list: ${JSON.stringify(files)}`);

    const nonKeepFiles = files.filter(f => f !== '.gitkeep');
    if (nonKeepFiles.length > 0) {
      console.log(`  - Residual uploaded files detected: ${JSON.stringify(nonKeepFiles)}`);
    } else {
      console.log('  - Directory status: Clean (only .gitkeep is present)');
    }

    console.log('\n========================================================');
    console.log('       AUDIT COMPLETE: NO WRITES / DELETIONS PERFORMED   ');
    console.log('========================================================');
  } catch (err) {
    console.error('Audit execution error:', err.message);
  } finally {
    await pool.end();
  }
}

runReadOnlyAudit();
