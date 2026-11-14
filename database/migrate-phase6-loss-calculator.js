require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * Phase 6 Database Migration Script: Consumer Loss Calculator
 *
 * Creates table `case_loss_calculations` linked via foreign key to `cases(id)`.
 * Idempotent, safe, and non-destructive.
 */
async function migratePhase6() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD;
  const targetDb = process.env.DB_NAME || 'graahak_ai';

  console.log('========================================================');
  console.log('    Graahak AI - Phase 6 Loss Calculator Migration      ');
  console.log('========================================================\n');

  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: targetDb,
    });
    console.log(`[Migration] Connected to database '${targetDb}'.`);

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`case_loss_calculations\` (
        \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
        \`case_id\` BIGINT NOT NULL,
        \`purchase_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`delivery_installation_charges\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`repair_replacement_expenses\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`travel_communication_expenses\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`other_documented_expenses\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`refunds_received\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`gross_loss\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`net_loss\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`annual_interest_rate\` DECIMAL(5, 2) NULL DEFAULT NULL,
        \`interest_start_date\` DATE NULL DEFAULT NULL,
        \`interest_end_date\` DATE NULL DEFAULT NULL,
        \`interest_days\` INT NULL DEFAULT 0,
        \`estimated_interest\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`total_estimated_claim\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`expense_breakdown\` JSON NULL,
        \`calculation_notes\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_case_loss_case_id\` (\`case_id\`),
        INDEX \`idx_case_loss_created_at\` (\`created_at\`),
        CONSTRAINT \`fk_case_loss_case_id\`
          FOREIGN KEY (\`case_id\`) REFERENCES \`cases\` (\`id\`)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    console.log("[Migration] Ensuring table 'case_loss_calculations' exists...");
    await connection.query(createTableQuery);
    console.log("[Migration] Table 'case_loss_calculations' verified/created successfully.\n");

    return { success: true };
  } catch (error) {
    console.error(`[Migration Error] Failed during Phase 6 migration: ${error.message}`);
    return { success: false, error };
  } finally {
    if (connection) {
      await connection.end();
      console.log('[Migration] Database connection closed.');
    }
  }
}

if (require.main === module) {
  migratePhase6().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}

module.exports = migratePhase6;
