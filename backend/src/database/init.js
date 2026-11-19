// `npm run init-db`: fresh-clone initialization through the verified pipeline.
//
// D-10: the previous implementation ran schema.sql directly and treated
// procedures/triggers failures as optional "notes", which could leave a
// half-migrated database that looked initialized. This script delegates to the
// same ordered, idempotent pipeline setup-demo uses
// (schema.sql -> procedures -> triggers -> ordered migrations ->
// verifyEffectiveSchema) and FAILS with a nonzero exit when verification finds
// any gap, so a broken setup can never be mistaken for a working database.
//
// Target schema: DB_NAME (default workzen_hrms). The name is validated against
// the same charset rule every setup script uses; protected production
// databases remain operator decisions, not script defaults beyond that name.

import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import {
  assertSafeSchemaName,
  initializeTargetSchema,
  schemaIsInitialized,
} from "./setup/schemaSetup.js";

dotenv.config();

const targetSchema = () => process.env.DB_NAME || "workzen_hrms";

export const initializeDatabase = async (config = {}) => {
  const schema = assertSafeSchemaName(config.schema ?? targetSchema());
  const connection = await mysql.createConnection({
    host: config.host ?? process.env.DB_HOST,
    user: config.user ?? process.env.DB_USER,
    password: config.password ?? process.env.DB_PASSWORD,
    port: config.port ?? process.env.DB_PORT,
    multipleStatements: true,
  });

  try {
    const wasInitialized = await schemaIsInitialized(connection, schema);
    if (wasInitialized) {
      console.log(
        `ℹ️  ${schema} already contains core tables; running the idempotent ` +
          "migration pass and verification only.",
      );
    }

    const { migrations, verification } = await initializeTargetSchema(
      connection,
      schema,
      (step) => {
        const detail = step.detail
          ? typeof step.detail === "string"
            ? step.detail
            : JSON.stringify(step.detail)
          : "";
        console.log(`  • ${step.step ?? step.title}: ${detail}`);
      },
    );

    for (const migration of migrations) {
      console.log(`  ✔ ${migration.title} (${migration.ms}ms)`);
    }

    if (!verification.ok) {
      const failed = verification.checks.filter((check) => !check.ok);
      console.error(`❌ Schema verification failed for ${schema}:`);
      for (const check of failed) {
        console.error(`   - ${check.name}: ${check.detail}`);
      }
      console.error(
        "   The database is NOT ready. Fix the gaps above (the migration " +
          "commands are documented in DEPLOYMENT.md) and re-run this script.",
      );
      process.exitCode = 1;
      return { ok: false, verification };
    }

    console.log(`✅ ${schema} is ready:`);
    for (const check of verification.checks) {
      console.log(`   ✔ ${check.name}: ${check.detail}`);
    }
    console.log(`   tables: ${verification.tableCount}`);
    return { ok: true, verification };
  } finally {
    await connection.end();
  }
};

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  initializeDatabase().catch((error) => {
    console.error(`❌ Database initialization failed: ${error.message}`);
    process.exit(1);
  });
}
