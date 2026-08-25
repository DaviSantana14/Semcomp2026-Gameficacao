# Production CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy every successful push to `main` automatically to the existing Semcomp production host using GitHub Actions and short-lived AWS OIDC credentials.

**Architecture:** Create an IAM-only CloudFormation stack with a GitHub OIDC provider and a least-privilege deployment role, leaving the runtime stack untouched. Add a gated deployment job to the existing CI workflow so the already-tested immutable ECR/S3/SSM publication script runs only after both CI jobs pass.

**Tech Stack:** GitHub Actions, GitHub Environments, AWS IAM OIDC, CloudFormation, ECR, S3, Systems Manager, PowerShell 7, Docker Compose.

## Global Constraints

- Production is `https://gameficacao.semcomp.com.br` in `sa-east-1`.
- The stack and Compose project are both named `semcomp-production`.
- Only a `push` to `main` may deploy, and only after `deployment-artifacts` and `build` pass.
- The GitHub environment is `production` and permits only the `main` deployment branch.
- Authentication uses OIDC; no persistent AWS access key is stored in GitHub.
- A deployment already running is never cancelled by a newer push.
- Images remain immutable and are activated only by digest through the existing publication scripts.
- The CD role cannot read production parameters or backups and cannot alter CloudFormation resources.

## File Map

- Create `deploy/aws/production/cd-cloudformation.yml`: own only the GitHub OIDC provider, deployment role, least-privilege policy, and role ARN output.
- Create `deploy/aws/production/cd-cloudformation.test.mjs`: enforce IAM-only isolation, the OIDC trust boundary, and the AWS permission boundary.
- Create `deploy/aws/production/cd-workflow.test.mjs`: enforce the main/CI/environment/concurrency workflow gates.
- Modify `.github/workflows/ci.yml`: add the production deployment job.
- Modify `package.json`: include the CD workflow contract in `test:production-deployment`.
- Modify `docs/operations/marco-14-runbook.md`: document automatic deployment, evidence, and failure handling.

---

### Task 1: Add the isolated least-privilege GitHub OIDC deployment stack

**Files:**

- Create: `deploy/aws/production/cd-cloudformation.test.mjs`
- Create: `deploy/aws/production/cd-cloudformation.yml`

**Interfaces:**

- Consumes: parameters `ReleaseBucketName` and `ProductionInstanceId`, fixed repository names `semcomp-production/api` and `semcomp-production/web`, and runtime stack name `semcomp-production`.
- Produces: CloudFormation output `GitHubActionsDeployRoleArn` containing the ARN used by `${{ vars.AWS_DEPLOY_ROLE_ARN }}`.

- [ ] **Step 1: Add failing OIDC trust and permission tests**

Create tests that require exactly two IAM resources, the exact repository/environment subject, and reject broad access or any EC2/EBS/EIP/S3/ECR runtime resource:

```javascript
test("trusts only the production GitHub environment through OIDC", () => {
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

test("limits the GitHub deployment role to immutable release publication", () => {
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
    assert.match(role, new RegExp(action.replace(":", "\\:")));
  }

  assert.match(role, /releases\/\*/);
  assert.match(role, /AWS-RunShellScript/);
  assert.match(role, /!Ref ProductionInstance/);
  assert.doesNotMatch(role, /ssm:GetParameters?\b/);
  assert.doesNotMatch(role, /backups\/\*/);
  assert.doesNotMatch(role, /cloudformation:(?:Update|Create|Delete)/);
  assert.doesNotMatch(role, /Action:\s+['"]?\*['"]?/);
  assert.match(outputBlock("GitHubActionsDeployRoleArn"), /!GetAtt GitHubActionsDeployRole\.Arn/);
});
```

- [ ] **Step 2: Run the contract test and observe the missing resources**

Run:

```powershell
node --test deploy/aws/production/cd-cloudformation.test.mjs
```

Expected: FAIL mentioning `resource GitHubActionsOidcProvider must exist`.

- [ ] **Step 3: Add the OIDC provider and role to CloudFormation**

Add `GitHubActionsOidcProvider` with URL
`https://token.actions.githubusercontent.com` and client ID
`sts.amazonaws.com`. Add `GitHubActionsDeployRole` with deterministic role name
`${AWS::StackName}-github-deploy`, session limit 3600 seconds, and this trust
condition:

```yaml
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Federated: !Ref GitHubActionsOidcProvider
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals:
                'token.actions.githubusercontent.com:aud': sts.amazonaws.com
                'token.actions.githubusercontent.com:sub': repo:DaviSantana14/Semcomp2026-Gameficacao:environment:production
```

Define inline statements with these exact boundaries:

```yaml
          - Sid: DescribeProductionStack
            Effect: Allow
            Action: cloudformation:DescribeStacks
            Resource: !Sub 'arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${AWS::StackName}/*'
          - Sid: AuthenticateToEcr
            Effect: Allow
            Action: ecr:GetAuthorizationToken
            Resource: '*'
          - Sid: PublishProductionImages
            Effect: Allow
            Action:
              - ecr:BatchCheckLayerAvailability
              - ecr:BatchGetImage
              - ecr:CompleteLayerUpload
              - ecr:DescribeImages
              - ecr:GetDownloadUrlForLayer
              - ecr:InitiateLayerUpload
              - ecr:PutImage
              - ecr:UploadLayerPart
            Resource:
              - !GetAtt ApiRepository.Arn
              - !GetAtt WebRepository.Arn
          - Sid: PublishReleaseArtifacts
            Effect: Allow
            Action: s3:PutObject
            Resource: !Sub '${BackupBucket.Arn}/releases/*'
          - Sid: DispatchProductionRelease
            Effect: Allow
            Action: ssm:SendCommand
            Resource:
              - !Sub 'arn:${AWS::Partition}:ssm:${AWS::Region}::document/AWS-RunShellScript'
              - !Sub 'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:instance/${ProductionInstance}'
          - Sid: ObserveProductionRelease
            Effect: Allow
            Action: ssm:GetCommandInvocation
            Resource: '*'
```

Add the output:

```yaml
  GitHubActionsDeployRoleArn:
    Description: OIDC role assumed by the production GitHub Actions environment
    Value: !GetAtt GitHubActionsDeployRole.Arn
```

- [ ] **Step 4: Run the CloudFormation contracts**

Run:

```powershell
node --test deploy/aws/production/cloudformation.test.mjs
```

Expected: all CloudFormation contract tests PASS.

- [ ] **Step 5: Commit the infrastructure boundary**

```powershell
git add deploy/aws/production/cloudformation.yml deploy/aws/production/cloudformation.test.mjs
git commit -m "feat: add github oidc deployment role"
```

---

### Task 2: Gate automatic production deployment behind the existing CI

**Files:**

- Create: `deploy/aws/production/cd-workflow.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: GitHub environment variables `AWS_DEPLOY_ROLE_ARN` and `AWS_ACCOUNT_ID`; CloudFormation output `GitHubActionsDeployRoleArn`; existing `publish.ps1` parameters.
- Produces: job `deploy-production`, serialized by concurrency group `semcomp-production`, and included in `test:production-deployment`.

- [ ] **Step 1: Write the failing workflow contract**

Create a Node test that reads `.github/workflows/ci.yml` and verifies:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

const deployMatch = workflow.match(
  /^  deploy-production:\r?\n(?<body>[\s\S]*?)(?=^  [a-zA-Z0-9_-]+:|\s*$)/m,
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
  const job = deployMatch.groups.body;
  assert.match(job, /group: semcomp-production/);
  assert.match(job, /cancel-in-progress: false/);
  assert.match(job, /timeout-minutes: 30/);
});

test("uses OIDC variables and the immutable publisher", () => {
  const job = deployMatch.groups.body;
  assert.match(job, /id-token: write/);
  assert.match(job, /contents: read/);
  assert.match(job, /aws-actions\/configure-aws-credentials@[0-9a-f]{40}/);
  assert.match(job, /vars\.AWS_DEPLOY_ROLE_ARN/);
  assert.match(job, /vars\.AWS_ACCOUNT_ID/);
  assert.match(job, /deploy\/aws\/production\/scripts\/publish\.ps1/);
  assert.doesNotMatch(job, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});
```

Add `deploy/aws/production/cd-workflow.test.mjs` to the `node --test` portion of
`test:production-deployment`.

- [ ] **Step 2: Run the contract and observe the missing job**

Run:

```powershell
npm run test:production-deployment
```

Expected: FAIL with `deploy-production job must exist`.

- [ ] **Step 3: Add the automatic deployment job**

Append this job to `.github/workflows/ci.yml`:

```yaml
  deploy-production:
    needs: [deployment-artifacts, build]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      id-token: write
    environment:
      name: production
      url: https://gameficacao.semcomp.com.br
    concurrency:
      group: semcomp-production
      cancel-in-progress: false

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Configure temporary AWS credentials
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          role-session-name: semcomp-production-${{ github.run_id }}
          aws-region: sa-east-1

      - name: Publish immutable production release
        shell: pwsh
        run: >-
          ./deploy/aws/production/scripts/publish.ps1
          -ExpectedAccountId '${{ vars.AWS_ACCOUNT_ID }}'
          -Region sa-east-1
          -StackName semcomp-production
          -RepositoryPath .
```

- [ ] **Step 4: Run the production deployment suite**

Run:

```powershell
npm run test:production-deployment
```

Expected: every Node and shell contract test PASS.

- [ ] **Step 5: Commit the workflow gate**

```powershell
git add .github/workflows/ci.yml package.json deploy/aws/production/cd-workflow.test.mjs
git commit -m "ci: deploy main automatically to production"
```

---

### Task 3: Document and validate the complete local change

**Files:**

- Modify: `docs/operations/marco-14-runbook.md`

**Interfaces:**

- Consumes: job `deploy-production`, environment variables, role output, current release inspection commands.
- Produces: operator instructions that do not expose credentials or participant data.

- [ ] **Step 1: Add an automatic deployment section to the runbook**

Document these invariants and commands:

```markdown
## Deploy automático da `main`

O job `deploy-production` roda somente depois dos jobs `deployment-artifacts`
e `build` ficarem verdes em um push na `main`. Ele assume a role indicada por
`AWS_DEPLOY_ROLE_ARN` no ambiente GitHub `production`; não existem access keys
persistentes no repositório.

Para conferir o release ativo sem exibir segredos:

```bash
current_release="$(readlink -f /opt/semcomp/current)"
printf 'release: %s\n' "${current_release##*/}"
curl --fail --silent --show-error https://gameficacao.semcomp.com.br/api/health
unset current_release
```

Se a CI falhar, não iniciar publicação manual para contornar o gate. Se o job
de CD falhar, preservar o release atual, consultar a etapa com erro e seguir a
seção "Falha de release" para qualquer rollback.
```

- [ ] **Step 2: Run all local gates**

Run:

```powershell
npm run test:production-deployment
docker compose --env-file deploy/aws/production/production.env.example -f deploy/aws/production/compose.yml config --quiet
git diff --check
```

Expected: tests PASS, Compose returns exit code 0, and `git diff --check` prints
nothing.

- [ ] **Step 3: Commit the runbook update**

```powershell
git add -f docs/operations/marco-14-runbook.md
git commit -m "docs: add automatic production deployment runbook"
```

---

### Task 4: Configure the isolated AWS CD stack and GitHub production environment

**Files:**

- No repository files.

**Interfaces:**

- Consumes: updated CloudFormation template, AWS IAM session, repository administration access.
- Produces: live OIDC provider, deployment role, GitHub `production` environment restricted to `main`, `AWS_DEPLOY_ROLE_ARN`, and `AWS_ACCOUNT_ID` variables.

- [ ] **Step 1: Authenticate and verify the exact AWS target**

Run `aws login`, then:

```powershell
aws sts get-caller-identity --query "{Account:Account,Arn:Arn}" --output json
aws configure get region
```

Expected: account `491521241602`, an IAM/Identity Center ARN rather than root,
and region `sa-east-1` or no configured default.

- [ ] **Step 2: Preflight the account-wide GitHub OIDC provider**

```powershell
aws iam list-open-id-connect-providers --output json
```

Expected for this new account: no provider whose ARN ends in
`token.actions.githubusercontent.com`. If one exists, import it into the stack
before deploying instead of creating a duplicate.

- [ ] **Step 3: Validate and deploy the updated stack**

```powershell
aws cloudformation validate-template --template-body file://deploy/aws/production/cd-cloudformation.yml --region sa-east-1
aws cloudformation deploy --template-file deploy/aws/production/cd-cloudformation.yml --stack-name semcomp-production-cd --parameter-overrides ProductionInstanceId=i-08e9a8b7956b4cf0e ReleaseBucketName=semcomp-production-backupbucket-xm91ienviuvd --capabilities CAPABILITY_NAMED_IAM --region sa-east-1 --no-fail-on-empty-changeset
```

Expected: `Successfully created/updated stack - semcomp-production-cd` with
exactly one OIDC provider and one IAM role. The change set must not contain
`ProductionInstance`, `DockerDataVolume`, `ProductionElasticIp`, or any other
runtime resource.

- [ ] **Step 4: Capture and verify the role output**

```powershell
$deployRoleArn = aws cloudformation describe-stacks --stack-name semcomp-production-cd --region sa-east-1 --query "Stacks[0].Outputs[?OutputKey=='GitHubActionsDeployRoleArn'].OutputValue | [0]" --output text
$accountId = aws sts get-caller-identity --query Account --output text
$deployRoleArn
$accountId
```

Expected: role ARN ending in `role/semcomp-production-github-deploy` and account
ID `491521241602`.

- [ ] **Step 5: Configure the GitHub environment**

In repository Settings → Environments:

1. Create or open `production`.
2. Under deployment branches, choose selected branches and add only `main`.
3. Add environment variable `AWS_DEPLOY_ROLE_ARN` with `$deployRoleArn`.
4. Add environment variable `AWS_ACCOUNT_ID` with `$accountId`.
5. Do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`.

Expected: the environment lists only `main` and exactly the two non-secret AWS
variables above.

---

### Task 5: Merge once and prove the first automatic deployment

**Files:**

- No new source files; inspect Git and external deployment state.

**Interfaces:**

- Consumes: completed branch commits, configured AWS role, configured GitHub environment.
- Produces: merged `main`, successful CI/CD run, and active EC2 release matching the merge SHA.

- [ ] **Step 1: Re-run the complete pre-push verification**

```powershell
npm run test:production-deployment
docker compose --env-file deploy/aws/production/production.env.example -f deploy/aws/production/compose.yml config --quiet
git diff --check
git status --short
```

Expected: tests PASS, Compose exit 0, no diff errors, and only the user's
pre-existing `.codex-remote-attachments/` directory remains untracked.

- [ ] **Step 2: Push the feature branch and open a PR to `main`**

```powershell
git push -u origin feat/production-cd
```

Open the PR, wait for both existing CI jobs to pass, then merge it. Do not merge
if either job is red.

- [ ] **Step 3: Observe the deployment job on the merge commit**

Expected GitHub job sequence:

```text
deployment-artifacts ─┐
                      ├─> deploy-production
build ────────────────┘
```

The `deploy-production` job must finish green and report publication of the
full merge SHA.

- [ ] **Step 4: Verify production from AWS and HTTPS**

Read the current release through SSM and compare it with the merge SHA. Then:

```powershell
curl.exe --fail --silent --show-error https://gameficacao.semcomp.com.br/api/health
```

Expected: current release SHA equals the merge commit, health returns JSON with
`"status":"ok"`, and the previous release directory still exists for rollback.

- [ ] **Step 5: Record final evidence**

Record only the workflow URL, merge SHA, active release SHA, job result, and
health status. Do not record tokens, cookies, participant information, AWS
temporary credentials, or SSM parameter values.
