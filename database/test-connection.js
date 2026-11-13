require("dotenv").config();
const pool = require("../src/config/db");
const { testConnection } = pool;

/**
 * Standalone database verification script.
 * Verifies authentication, connection pooling, and target database accessibility.
 * Never exposes credentials in console logs.
 */
async function runDiagnostic() {
  console.log("=================================================");
  console.log("   Graahak AI - MySQL Connection Diagnostic      ");
  console.log("=================================================");
  console.log(`Host:     ${process.env.DB_HOST || "localhost"}`);
  console.log(`Port:     ${process.env.DB_PORT || 3306}`);
  console.log(`User:     ${process.env.DB_USER || "root"}`);
  console.log(`Database: ${process.env.DB_NAME || "graahak_ai"}`);
  console.log("-------------------------------------------------");

  console.log("[1/3] Testing connection pool with testConnection()...");
  const poolTest = await testConnection();

  if (!poolTest.success) {
    console.error("[FAILED] Connection pool test failed.");
    console.error(`Error Code:    ${poolTest.error.code || "UNKNOWN"}`);
    console.error(`Error Message: ${poolTest.error.message}`);
    console.log("=================================================");
    return { success: false, error: poolTest.error };
  }

  console.log("[SUCCESS] Connection acquired and verified via pool.");

  console.log("[2/3] Checking active database and MySQL server version...");
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT DATABASE() AS current_db, VERSION() AS mysql_version");
    const info = rows[0];

    console.log(`Active Database: ${info.current_db}`);
    console.log(`MySQL Version:   ${info.mysql_version}`);
    console.log("[SUCCESS] Database query executed successfully.");

    console.log("[3/3] Checking table inventory in database...");
    const [tables] = await connection.query("SHOW TABLES");
    console.log(`Total Tables:    ${tables.length}`);
    console.log("[SUCCESS] Database schema accessibility verified.");

    console.log("=================================================");
    console.log("   ALL DATABASE CHECKS PASSED SUCCESSFULLY       ");
    console.log("=================================================");

    return {
      success: true,
      database: info.current_db,
      version: info.mysql_version,
      tableCount: tables.length,
    };
  } catch (error) {
    console.error("[FAILED] Error during extended query verification:");
    console.error(`Error Code:    ${error.code || "UNKNOWN"}`);
    console.error(`Error Message: ${error.message}`);
    console.log("=================================================");
    return { success: false, error };
  } finally {
    if (connection) {
      connection.release();
    }
    // End the pool so the CLI script exits cleanly
    await pool.end();
  }
}

if (require.main === module) {
  runDiagnostic().then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = runDiagnostic;
