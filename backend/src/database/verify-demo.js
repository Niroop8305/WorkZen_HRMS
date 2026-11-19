import dotenv from "dotenv";
import { assertSafeSchemaName, connectToServer } from "./setup/schemaSetup.js";
import { verifyDemoDataset } from "./setup/verifyDemoData.js";

dotenv.config();

const databaseName = () =>
  assertSafeSchemaName(process.env.DB_NAME || "workzen_hrms");

const argv = process.argv.slice(2);
const databaseFlag = argv.find((arg) => arg.startsWith("--database="));
const schema = assertSafeSchemaName(
  databaseFlag ? databaseFlag.split("=")[1] : databaseName(),
);
// --allow-empty is used by tests that verify a partially seeded environment.
const requireDemoCoverage = !argv.includes("--allow-empty");

const connection = await connectToServer();
try {
  await connection.query(`USE \`${schema}\``);
  const result = await verifyDemoDataset(connection, schema, {
    requireDemoCoverage,
  });

  for (const check of result.checks) {
    console.log(
      `${check.ok ? "ok  " : "FAIL"} ${check.name}` +
        (check.ok ? "" : ` (${check.violations} violations)`) +
        (check.detail ? ` - ${check.detail}` : ""),
    );
  }
  console.log(`counts: ${JSON.stringify(result.counts)}`);
  console.log(
    result.ok
      ? `Integrity verification passed for ${schema}.`
      : `Integrity verification FAILED for ${schema}: ${result.failed.length} check(s).`,
  );
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error("Integrity verification failed:", error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
