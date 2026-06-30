import { loadEnvConfig } from "@next/env";
import { discoverSteamReleases } from "../src/lib/release-automation";

loadEnvConfig(process.cwd());

discoverSteamReleases()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
