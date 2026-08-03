import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(
  new URL("./capture-metrics.sh", import.meta.url),
  "utf8",
);
const loadScript = await readFile(
  new URL("../../../scripts/load/marco-9-load.mjs", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
);

test("collects metrics that apply to m7i-flex.large", () => {
  for (const metric of [
    "CPUUtilization",
    "NetworkIn",
    "NetworkOut",
    "StatusCheckFailed",
  ]) {
    assert.match(script, new RegExp(`aws_metric_value ${metric}(?:\\s|$)`));
  }
});

test("does not request burstable CPU credit metrics for m7i-flex.large", () => {
  assert.doesNotMatch(script, /CPUCredit(?:Balance|Usage)/);
  assert.doesNotMatch(script, /CPUSurplusCreditsCharged/);
});

test("benchmarks bcrypt cost 12 inside the API container on the rehearsal host", () => {
  assert.match(script, /exec\s+-T\s+api\s+node/s);
  assert.match(script, /bcrypt\.hash\([^,]+,\s*12\)/s);
  assert.match(script, /bcrypt\.compare\(/);
  assert.match(script, /"type":"bcrypt"/);
});

test("does not benchmark bcrypt on the load-generating client", () => {
  assert.doesNotMatch(loadScript, /benchmarkBcrypt/);
  assert.doesNotMatch(loadScript, /import\("bcrypt"\)/);
});

test("selects the newest CloudWatch datapoint by timestamp", () => {
  assert.match(script, /sort_by\(Datapoints,&Timestamp\)\[-1\]/);
});

test("does not require Node.js to be installed directly on the EC2 host", () => {
  assert.doesNotMatch(script, /\|\s*node\s+--input-type=module/);
});

test("CI executes the CloudFormation and metrics regression tests", () => {
  assert.match(workflow, /cloudformation\.test\.mjs/);
  assert.match(workflow, /capture-metrics\.test\.mjs/);
});

test("the deployment suite includes release rollback tests", () => {
  assert.match(
    packageJson.scripts["test:deployment-scripts"],
    /release-scripts\.test\.sh/,
  );
});
