require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * Phase 4A Database Migration Script
 *
 * Adds document classification columns and indexes to case_documents:
 * - document_type VARCHAR(100) NOT NULL DEFAULT 'OTHER'
 * - description VARCHAR(255) NULL
 * - INDEX idx_case_documents_doc_type (document_type)
 *
 * Safety & Compatibility Guarantees:
 * - Idempotent: uses INFORMATION_SCHEMA checks before modifying schema.
 * - Non-destructive: preserves all existing records, foreign keys, and tables.
 * - Leaves evidence_evaluations schema untouched for backward compatibility.
 * - Closes database connections safely in a finally block.
 */
async function migratePhase4() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD;
  const targetDb = process.env.DB_NAME || 'graahak_ai';

  console.log('========================================================');
  console.log('       Graahak AI - Phase 4A Database Migration         ');
  console.log('========================================================\n');
  console.log(`[Migration] Connecting to MySQL at ${host}:${port} as user '${user}'...`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: targetDb,
    });
    console.log(`[Migration] Connected to database '${targetDb}'.\n`);

    // --- Step 1: Inspect and Add Columns to case_documents ---
    console.log("[Step 1/3] Inspecting columns in table 'case_documents'...");
    const [existingCols] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'case_documents' AND COLUMN_NAME IN ('document_type', 'description')`,
      [targetDb]
    );

    const columnSet = new Set(existingCols.map((c) => c.COLUMN_NAME));
    console.log(
      `[Step 1/3] Existing target columns detected: ${columnSet.size > 0 ? Array.from(columnSet).join(', ') : 'none'}`
    );

    if (!columnSet.has('document_type')) {
      console.log("[Migration] Adding column 'document_type' to 'case_documents'...");
      await connection.query(
        "ALTER TABLE `case_documents` ADD COLUMN `document_type` VARCHAR(100) NOT NULL DEFAULT 'OTHER' AFTER `mime_type`"
      );
      console.log("[Migration] Column 'document_type' added successfully.");
    } else {
      console.log("[Migration] Column 'document_type' already exists. Skipping.");
    }

    if (!columnSet.has('description')) {
      console.log("[Migration] Adding column 'description' to 'case_documents'...");
      await connection.query(
        "ALTER TABLE `case_documents` ADD COLUMN `description` VARCHAR(255) NULL AFTER `document_type`"
      );
      console.log("[Migration] Column 'description' added successfully.");
    } else {
      console.log("[Migration] Column 'description' already exists. Skipping.");
    }

    // --- Step 2: Inspect and Add Index to case_documents ---
    console.log("\n[Step 2/3] Inspecting indexes in table 'case_documents'...");
    const [existingIndexes] = await connection.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'case_documents' AND INDEX_NAME = 'idx_case_documents_doc_type'`,
      [targetDb]
    );

    if (existingIndexes.length === 0) {
      console.log("[Migration] Adding index 'idx_case_documents_doc_type' to 'case_documents'...");
      await connection.query(
        'ALTER TABLE `case_documents` ADD INDEX `idx_case_documents_doc_type` (`document_type`)'
      );
      console.log("[Migration] Index 'idx_case_documents_doc_type' created successfully.");
    } else {
      console.log("[Migration] Index 'idx_case_documents_doc_type' already exists. Skipping.");
    }

    // --- Step 3: Verification of Table Structure & Foreign Keys ---
    console.log('\n[Step 3/3] Verifying table schema and foreign key constraints...');
    const [finalCols] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'case_documents'
       ORDER BY ORDINAL_POSITION`,
      [targetDb]
    );

    const [fks] = await connection.query(
      `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'case_documents' AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [targetDb]
    );

    console.log('[Migration] Current case_documents columns:');
    finalCols.forEach((col) => {
      console.log(
        `  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (Nullable: ${col.IS_NULLABLE}, Default: ${col.COLUMN_DEFAULT})`
      );
    });

    console.log('[Migration] Active foreign keys:');
    fks.forEach((fk) => {
      console.log(
        `  - ${fk.CONSTRAINT_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`
      );
    });

    console.log('\n========================================================');
    console.log('       Phase 4A Migration Completed Successfully        ');
    console.log('========================================================\n');

    return {
      success: true,
      database: targetDb,
      columns: finalCols.map((c) => c.COLUMN_NAME),
    };
  } catch (error) {
    console.error(`\n[Migration Error] Failed during Phase 4A migration: ${error.message}`);
    return {
      success: false,
      error,
    };
  } finally {
    if (connection) {
      await connection.end();
      console.log('[Migration] Database connection closed.');
    }
  }
}

if (require.main === module) {
  migratePhase4().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}

module.exports = migratePhase4;
