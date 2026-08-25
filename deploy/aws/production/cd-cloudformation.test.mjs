import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const template = await readFile(
  new URL("./cd-cloudformation.yml", import.meta.url),
  "utf8",
).catch(() => "");

const resourceBlock = (logicalId) => {
  const match = template.match(
    new RegExp(
      `^  ${logicalId}:\\r?\\n(?<body>(?:(?:^    .*\\r?\\n)|(?:^\\r?\\n))*)`,
      "m",
    ),
  );

  assert.ok(match, `resource ${logicalId} must exist`);
  return match.groups.body;
};

const outputBlock = (logicalId) => {
  const outputs = template.split(/^Outputs:\r?\n/m, 2)[1];
  assert.ok(outputs, "Outputs section must exist");

  const match = outputs.match(
    new RegExp(
      `^  ${logicalId}:\\r?\\n(?<body>(?:(?:^    .*\\r?\\n)|(?:^\\r?\\n))*)`,
      "m",
    ),
  );

  assert.ok(match, `output ${logicalId} must exist`);
  return match.groups.body;
};

test("contains only the IAM resources required by CD", () => {
  assert.equal((template.match(/^    Type: AWS::IAM::OIDCProvider$/gm) ?? []).length, 1);
  assert.equal((template.match(/^    Type: AWS::IAM::Role$/gm) ?? []).length, 1);
  assert.equal((template.match(/^    Type: AWS::/gm) ?? []).length, 2);

  for (const forbidden of [
    "AWS::EC2::",
    "AWS::EBS::",
    "AWS::ECR::Repository",
    "AWS::S3::Bucket",
    "AWS::RDS::",
  ]) {
    assert.doesNotMatch(template, new RegExp(forbidden));
  }
});

test("trusts only the repository production environment", () => {
  const provider = resourceBlock("GitHubActionsOidcProvider");
  const role = resourceBlock("GitHubActionsDeployRole");

  assert.match(provider, /Url: https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(provider, /- sts\.amazonaws\.com/);
  assert.match(role, /sts:AssumeRoleWithWebIdentity/);
  assert.match(
    role,
    /repo:DaviSantana14\/Semcomp2026-Gameficacao:environment:production/,
  );
  assert.match(role, /token\.actions\.githubusercontent\.com:aud/);
  assert.match(role, /token\.actions\.githubusercontent\.com:sub/);
  assert.doesNotMatch(role, /repo:DaviSantana14\/\*/);
});

test("limits publication to the existing production release paths", () => {
  const role = resourceBlock("GitHubActionsDeployRole");

  for (const action of [
    "cloudformation:DescribeStacks",
    "ecr:GetAuthorizationToken",
    "ecr:DescribeImages",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload",
    "ecr:PutImage",
    "s3:PutObject",
    "ssm:SendCommand",
    "ssm:GetCommandInvocation",
  ]) {
    assert.match(role, new RegExp(action));
  }

  assert.match(role, /repository\/semcomp-production\/api/);
  assert.match(role, /repository\/semcomp-production\/web/);
  assert.match(role, /\$\{ReleaseBucketName\}\/releases\/\*/);
  assert.match(role, /AWS-RunShellScript/);
  assert.match(role, /instance\/\$\{ProductionInstanceId\}/);
  assert.doesNotMatch(role, /ssm:GetParameters?\b/);
  assert.doesNotMatch(role, /backups\/\*/);
  assert.doesNotMatch(role, /(?:Delete|Terminate|Stop|Reboot|Detach|Disassociate)/);
  assert.doesNotMatch(role, /cloudformation:(?:Update|Create|Delete)/);
  assert.doesNotMatch(role, /Action:\s+['"]?\*['"]?/);
});

test("publishes the deploy role ARN", () => {
  assert.match(
    outputBlock("GitHubActionsDeployRoleArn"),
    /!GetAtt GitHubActionsDeployRole\.Arn/,
  );
});
