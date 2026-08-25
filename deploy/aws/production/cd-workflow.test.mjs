import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

const deployMatch = workflow.match(
  /^  deploy-production:\r?\n(?<body>(?:(?:^    .*\r?\n)|(?:^\r?\n))*)/m,
);

test("deploys main only after both CI jobs pass", () => {
  assert.ok(deployMatch, "deploy-production job must exist");
  const job = deployMatch.groups.body;

  assert.match(job, /needs:\s*\[deployment-artifacts, build\]/);
  assert.match(job, /github\.event_name == 'push'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /name: production/);
  assert.match(job, /https:\/\/gameficacao\.semcomp\.com\.br/);
});

test("serializes deployments without cancelling an active release", () => {
  assert.ok(deployMatch, "deploy-production job must exist");
  const job = deployMatch.groups.body;

  assert.match(job, /group: semcomp-production/);
  assert.match(job, /queue: max/);
  assert.match(job, /cancel-in-progress: false/);
  assert.match(job, /timeout-minutes: 30/);
});

test("uses OIDC variables and the immutable publisher", () => {
  assert.ok(deployMatch, "deploy-production job must exist");
  const job = deployMatch.groups.body;

  assert.match(job, /id-token: write/);
  assert.match(job, /contents: read/);
  assert.match(job, /aws-actions\/configure-aws-credentials@[0-9a-f]{40}/);
  assert.match(job, /allowed-account-ids:\s*\$\{\{ vars\.AWS_ACCOUNT_ID \}\}/);
  assert.match(job, /vars\.AWS_DEPLOY_ROLE_ARN/);
  assert.match(job, /vars\.AWS_ACCOUNT_ID/);
  assert.match(job, /deploy\/aws\/production\/scripts\/publish\.ps1/);
  assert.doesNotMatch(job, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);

  const externalActions = [...job.matchAll(/^\s+uses:\s+([^\s]+)$/gm)].map(
    ([, action]) => action,
  );
  assert.ok(externalActions.length >= 2, "deployment must use checkout and OIDC actions");
  for (const action of externalActions) {
    assert.match(action, /@[0-9a-f]{40}$/, `action must be SHA-pinned: ${action}`);
  }
});
