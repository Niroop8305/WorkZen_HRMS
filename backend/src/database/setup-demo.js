import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { getBusinessNow } from "../config/attendance.js";
import {
  connectToServer,
  initializeTargetSchema,
  schemaIsInitialized,
  assertSafeSchemaName,
} from "./setup/schemaSetup.js";
import { seedDemoUsers } from "./seed-demo-users.js";
import {
  buildPlanSummary,
  generateBenchmark,
  loadReferenceData,
  parseArgs as parseGeneratorArgs,
  resolvePeriod,
} from "./generate-benchmark.js";
import { coveredMonths } from "./benchmark/plan.js";
import { verifyDemoDataset } from "./setup/verifyDemoData.js";

dotenv.config();

const DEMO_EMAILS = [
  "admin@workzen.demo",
  "hr@workzen.demo",
  "payroll@workzen.demo",
  "employee@workzen.demo",
];

const parseSetupArgs = (argv) => {
  const options = { skipGenerate: false, reseedDemoUsers: false };
  const passthrough = [];
  for (const arg of argv) {
    if (arg === "--skip-generate") options.skipGenerate = true;
    else if (arg === "--reseed-demo-users") options.reseedDemoUsers = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else passthrough.push(arg);
  }
  return { options, generatorOptions: parseGeneratorArgs(passthrough) };
};

const HELP = `npm run setup:demo -- [options]

Prepares a fully populated WorkZen HRMS environment in one command:
  1. create the target database and schema (schema.sql)
  2. apply stored procedures, triggers and every required migration in order
  3. seed the four documented demo accounts
  4. generate the deterministic demonstration and benchmark dataset
  5. verify post-seed integrity

Options
  --database=<name>            target schema (default: DB_NAME from .env)
  --skip-generate              stop after schema + demo seed
  --reseed-demo-users          refresh the four demo accounts' passwords
  --dry-run                    plan and print volumes without writing benchmark rows
  --force-reseed-benchmark --yes
                               delete generator-owned @workzen.test employees and rebuild
  --employees, --months, --leave-applications, --senior-count,
  --senior-extra-months, --end-period, --seed, --chunk-size
                               benchmark sizing (see generate:benchmark)
`;

const setupDemo = async () => {
  const { options, generatorOptions } = parseSetupArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("setup:demo refuses to run with NODE_ENV=production");
  }
  if (generatorOptions.forceReseed && !generatorOptions.yes) {
    throw new Error(
      "--force-reseed-benchmark deletes generator-owned employees. Add --yes to confirm.",
    );
  }

  const schema = assertSafeSchemaName(generatorOptions.database);
  const businessDate = getBusinessNow().date;
  const period = resolvePeriod(generatorOptions, businessDate);
  const connection = await connectToServer();

  try {
    const alreadyInitialized = await schemaIsInitialized(connection, schema);
    console.log(
      `Target schema: ${schema} (${alreadyInitialized ? "already initialized; setup will not drop or reseed data" : "new / incomplete"})`,
    );

    console.log("\n[1/5] Schema initialization");
    const { migrations, verification } = await initializeTargetSchema(connection, schema);
    console.log("  schema.sql applied (tables, views, reference data)");

    console.log("\n[2/5] Migrations in dependency order");
    for (const step of migrations) {
      console.log(`  ${step.id}: ${step.detail} (${step.ms} ms)`);
    }
    for (const check of verification.checks) {
      console.log(`  verify ${check.name}: ${check.ok ? "ok" : "FAILED"} - ${check.detail}`);
    }
    if (!verification.ok) {
      throw new Error("Effective schema does not match the application's requirements");
    }

    console.log("\n[3/5] Demo account seeding");
    const [existingDemo] = await connection.query(
      `SELECT COUNT(*) AS total FROM users WHERE email IN (?)`,
      [DEMO_EMAILS],
    );
    const demoPresent = Number(existingDemo[0].total) > 0;
    if (demoPresent && !options.reseedDemoUsers) {
      console.log(
        `  ${existingDemo[0].total} demo account(s) already present; skipped (use --reseed-demo-users to refresh)`,
      );
    } else {
      await connection.beginTransaction();
      try {
        const summary = await seedDemoUsers(connection);
        await connection.commit();
        for (const row of summary) {
          console.log(`  ${row.role}: user_id ${row.userId} (${row.email})`);
        }
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    console.log("\n[4/5] Benchmark dataset generation");
    let generation = null;
    if (options.skipGenerate) {
      console.log("  skipped (--skip-generate)");
    } else if (generatorOptions.dryRun) {
      const reference = await loadReferenceData(connection, generatorOptions, {
        readOnly: true,
      });
      console.log(
        `  dry run plan: ${JSON.stringify(
          buildPlanSummary(generatorOptions, { ...reference, period }),
        )}`,
      );
    } else {
      generation = await generateBenchmark(connection, generatorOptions, {
        businessDate,
        log: (entry) => console.log(`  ${JSON.stringify(entry)}`),
      });
      console.log(
        `  employees generated=${generation.totals.generated} skipped=${generation.totals.skipped}`,
      );
      console.log(
        `  attendance=${generation.totals.attendance} leave=${generation.totals.leaveApplications} ` +
          `payroll=${generation.totals.payroll} details=${generation.totals.payrollDetails}`,
      );
      console.log(`  elapsed=${generation.elapsedSeconds}s`);
      if (generation.demoCoverage) {
        console.log(
          `  demo employee coverage: attendance=${generation.demoCoverage.attendance} ` +
            `leave=${generation.demoCoverage.leaveApplications} payroll=${generation.demoCoverage.payroll} ` +
            `details=${generation.demoCoverage.payrollDetails}`,
        );
      }
    }

    console.log("\n[5/5] Post-seed integrity verification");
    const expectedPeriods = new Set();
    for (const months of [
      coveredMonths({ ...period, months: generatorOptions.months }),
      coveredMonths({
        ...period,
        months: generatorOptions.months + generatorOptions.seniorExtraMonths,
      }),
    ]) {
      for (const { year, month } of months) {
        expectedPeriods.add(`${year}-${String(month).padStart(2, "0")}`);
      }
    }

    const verificationResult = await verifyDemoDataset(connection, schema, {
      expectedPeriods: [...expectedPeriods].sort(),
      requireDemoCoverage: !options.skipGenerate,
    });
    for (const check of verificationResult.checks) {
      console.log(
        `  ${check.name}: ${check.ok ? "ok" : `FAILED (${check.violations} violations)`}` +
          (check.detail ? ` - ${check.detail}` : ""),
      );
    }
    console.log(`  counts: ${JSON.stringify(verificationResult.counts)}`);

    console.log(
      `\n${verificationResult.ok ? "Setup completed and verified." : "Setup finished with integrity failures."}`,
    );
    if (!verificationResult.ok) process.exitCode = 1;

    console.log(
      JSON.stringify(
        {
          schema,
          migrations: migrations.map((step) => `${step.id}: ${step.detail}`),
          generation: generation
            ? { totals: generation.totals, demoCoverage: generation.demoCoverage }
            : null,
          verification: {
            ok: verificationResult.ok,
            failed: verificationResult.failed,
            counts: verificationResult.counts,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
};

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  setupDemo().catch((error) => {
    console.error("setup:demo failed:", error.message);
    process.exitCode = 1;
  });
}
