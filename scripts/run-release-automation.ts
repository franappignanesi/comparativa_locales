import { loadEnvConfig } from "@next/env";
import { recordRefreshRun } from "../src/lib/operational-store";
import { runDailyReleaseAutomation } from "../src/lib/release-automation";

loadEnvConfig(process.cwd());

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  await recordRefreshRun({
    name: "github-release-automation",
    ok: false,
    statusCode: 500,
    summary: { error: message }
  });
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const result = await runDailyReleaseAutomation();
  await recordRefreshRun({
    name: "github-release-automation",
    ok: true,
    statusCode: 200,
    summary: result
  });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}
