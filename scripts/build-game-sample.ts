import { buildGameSample } from "../src/lib/sample-builder";

buildGameSample()
  .then((sample) => {
    console.log(
      JSON.stringify(
        {
          timestamp: sample.timestamp,
          strictSample: sample.strictSample.length,
          broadSample: sample.broadSample.length,
          rejected: sample.rejected.length,
          storeCoverage: sample.storeCoverage,
          categoryCoverage: sample.categoryCoverage
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
