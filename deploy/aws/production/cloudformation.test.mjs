import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const template = await readFile(
  new URL("./cloudformation.yml", import.meta.url),
  "utf8",
);

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

test("restricts production capacity to the approved instance type", () => {
  const parameterBlock = template.match(
    /^  InstanceType:\r?\n(?<body>(?:^    .*\r?\n)*)/m,
  )?.groups?.body;

  assert.ok(parameterBlock, "InstanceType parameter must exist");
  assert.match(parameterBlock, /^    Default: m7i-flex\.large$/m);

  const allowedValues = parameterBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

  assert.deepEqual(allowedValues, ["m7i-flex.large"]);
  assert.match(resourceBlock("ProductionInstance"), /InstanceType: !Ref InstanceType/);
});

test("exposes only HTTP and HTTPS from the production security group", () => {
  const securityGroup = resourceBlock("ProductionSecurityGroup");
  const ingressStart = securityGroup.indexOf("SecurityGroupIngress:");
  const egressStart = securityGroup.indexOf("SecurityGroupEgress:");
  const ingress =
    ingressStart >= 0 && egressStart > ingressStart
      ? securityGroup.slice(ingressStart, egressStart)
      : undefined;

  assert.ok(ingress, "security group ingress rules must exist");
  assert.match(ingress, /FromPort: 80/);
  assert.match(ingress, /ToPort: 80/);
  assert.match(ingress, /FromPort: 443/);
  assert.match(ingress, /ToPort: 443/);
  assert.doesNotMatch(ingress, /(?:FromPort|ToPort): 22/);
  assert.doesNotMatch(securityGroup, /(?:FromPort|ToPort): 22/);
});

test("defines the single public subnet and stable elastic IP", () => {
  assert.match(template, /CidrBlock: 10\.91\.0\.0\/16/);
  assert.match(resourceBlock("PublicSubnet"), /CidrBlock: 10\.91\.0\.0\/24/);
  assert.match(template, /^  ProductionElasticIp:\r?\n    Type: AWS::EC2::EIP$/m);
  assert.match(
    template,
    /^  ProductionElasticIpAssociation:\r?\n    Type: AWS::EC2::EIPAssociation$/m,
  );
  assert.match(resourceBlock("ProductionElasticIpAssociation"), /InstanceId: !Ref ProductionInstance/);
  assert.match(outputBlock("ProductionElasticIp"), /Value: !Ref ProductionElasticIp/);
});

test("requires IMDSv2 and preserves the encrypted Docker data volume", () => {
  const instance = resourceBlock("ProductionInstance");
  const dataVolume = resourceBlock("DockerDataVolume");

  assert.match(instance, /HttpTokens: required/);
  assert.match(dataVolume, /Size: 50/);
  assert.match(dataVolume, /VolumeType: gp3/);
  assert.match(dataVolume, /Encrypted: true/);
  assert.match(
    template,
    /^  DockerDataVolume:\r?\n    Type: AWS::EC2::Volume[\s\S]*?^    DeletionPolicy: Snapshot$/m,
  );
  assert.match(
    template,
    /^  DockerDataVolume:\r?\n[\s\S]*?^    UpdateReplacePolicy: Snapshot$/m,
  );
  assert.match(template, /AWS::EC2::VolumeAttachment/);
});

test("keeps the backup bucket private, encrypted, versioned, and retained", () => {
  const bucket = resourceBlock("BackupBucket");

  assert.match(
    template,
    /^  BackupBucket:\r?\n    Type: AWS::S3::Bucket\r?\n    DeletionPolicy: Retain$/m,
  );
  assert.match(template, /^    UpdateReplacePolicy: Retain$/m);
  assert.match(bucket, /SSEAlgorithm: AES256/);
  assert.match(bucket, /Status: Enabled/);
  assert.match(bucket, /BlockPublicAcls: true/);
  assert.match(bucket, /BlockPublicPolicy: true/);
  assert.match(bucket, /IgnorePublicAcls: true/);
  assert.match(bucket, /RestrictPublicBuckets: true/);
});

test("uses immutable, scan-on-push repositories for API and web", () => {
  for (const repository of ["ApiRepository", "WebRepository"]) {
    const block = resourceBlock(repository);
    assert.match(block, /ImageTagMutability: IMMUTABLE/);
    assert.match(block, /ScanOnPush: true/);
  }
});

test("limits the instance role to SSM parameters, ECR pulls, and operational prefixes", () => {
  const role = resourceBlock("ProductionInstanceRole");

  assert.match(role, /AmazonSSMManagedInstanceCore/);
  assert.match(
    role,
    /arn:\$\{AWS::Partition\}:ssm:\$\{AWS::Region\}:\$\{AWS::AccountId\}:parameter\/semcomp\/production\/\*/,
  );
  assert.match(role, /ecr:GetAuthorizationToken/);
  assert.match(role, /ecr:BatchGetImage/);
  assert.match(role, /ecr:GetDownloadUrlForLayer/);
  assert.match(role, /backups\/\*/);
  assert.match(role, /releases\/\*/);
  assert.doesNotMatch(role, /s3:\*/);
});

test("sets an 80 USD monthly budget with actual 50, 75, and 90 percent alerts", () => {
  const budget = resourceBlock("MonthlyBudget");

  assert.match(budget, /Amount: 80/);
  assert.match(budget, /Unit: USD/);
  assert.match(budget, /TimeUnit: MONTHLY/);
  assert.match(budget, /NotificationType: ACTUAL/);
  assert.match(budget, /ThresholdType: PERCENTAGE/);
  for (const threshold of [50, 75, 90]) {
    assert.match(budget, new RegExp(`Threshold: ${threshold}\\b`));
  }
});

test("bootstraps Docker on the UUID-mounted data volume and leaves operations timers disabled", () => {
  const userData = resourceBlock("ProductionInstance");

  assert.match(userData, /\/var\/lib\/docker/);
  assert.match(userData, /\/etc\/fstab/);
  assert.match(userData, /blkid/);
  assert.match(userData, /UUID=/);
  assert.match(userData, /docker-ce/);
  assert.match(userData, /docker-compose-plugin/);
  assert.match(userData, /AmazonSSMManagedInstanceCore|amazon-ssm-agent/);
  assert.match(userData, /\/opt\/semcomp\/shared\/nginx/);
  assert.match(userData, /semcomp-certbot-renew\.timer/);
  assert.match(userData, /semcomp-backup\.timer/);
  assert.match(userData, /systemctl disable .*semcomp-certbot-renew\.timer/);
  assert.match(userData, /systemctl disable .*semcomp-backup\.timer/);

  const mountIndex = userData.indexOf("mount /var/lib/docker");
  const dockerStartIndex = userData.indexOf("systemctl enable --now docker");
  assert.ok(mountIndex >= 0, "Docker data volume must be mounted explicitly");
  assert.ok(dockerStartIndex > mountIndex, "Docker must start after its data volume is mounted");
});

test("does not introduce disallowed managed services or a second EC2 instance", () => {
  assert.equal((template.match(/Type: AWS::EC2::Instance/g) ?? []).length, 1);
  for (const forbidden of [
    "AWS::ElasticLoadBalancing",
    "AWS::RDS::",
    "AWS::EC2::NatGateway",
    "AWS::ElastiCache::",
    "AWS::MemoryDB::",
  ]) {
    assert.doesNotMatch(template, new RegExp(forbidden));
  }
});

test("publishes the operational outputs required by the release flow", () => {
  for (const output of [
    "InstanceId",
    "ProductionElasticIp",
    "BackupBucketName",
    "ApiRepositoryUri",
    "WebRepositoryUri",
  ]) {
    assert.match(template, new RegExp(`^  ${output}:`, "m"));
  }
});
