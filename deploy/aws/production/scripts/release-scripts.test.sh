#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../../../.." && pwd)"
package_file="$repo_root/package.json"
ci_workflow="$repo_root/.github/workflows/ci.yml"
configure_script="$script_dir/configure-parameters.ps1"
publish_script="$script_dir/publish.ps1"
deploy_script="$script_dir/deploy-release.sh"
rollback_script="$script_dir/rollback-release.sh"
admin_password_script="$script_dir/set-admin-password.sh"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

contains() {
  grep -Fq -- "$1" <<<"$2"
}

assert_contains() {
  contains "$1" "$2" || fail "$3"
}

assert_not_contains() {
  ! contains "$1" "$2" || fail "$3"
}

[[ -f "$package_file" ]] || fail "missing repository package manifest: $package_file"
[[ -f "$ci_workflow" ]] || fail "missing CI workflow: $ci_workflow"
package_source="$(<"$package_file")"
ci_source="$(<"$ci_workflow")"
assert_contains '"test:production-deployment":' "$package_source" \
  'package.json does not expose test:production-deployment'
assert_contains 'npm run test:production-deployment' "$ci_source" \
  'CI does not execute test:production-deployment'

for required_file in "$configure_script" "$publish_script" "$deploy_script" "$rollback_script" "$admin_password_script"; do
  [[ -f "$required_file" ]] || fail "missing production release automation file: $required_file"
done

bash -n "$deploy_script"
bash -n "$rollback_script"
bash -n "$admin_password_script"

configure_source="$(<"$configure_script")"
publish_source="$(<"$publish_script")"
deploy_source="$(<"$deploy_script")"
rollback_source="$(<"$rollback_script")"
admin_source="$(<"$admin_password_script")"

assert_contains '/semcomp/production/' "$configure_source" 'parameters are not scoped to production'
assert_contains 'SecureString' "$configure_source" 'secure parameter type is not configured'
assert_contains 'RandomNumberGenerator' "$configure_source" 'secrets do not use a cryptographic RNG'
for secret_name in POSTGRES_PASSWORD JWT_SECRET RATE_LIMIT_KEY_SECRET; do
  assert_contains "$secret_name" "$configure_source" "missing generated secret: $secret_name"
done
for exact_value in \
  'semcomp_production' \
  'https://gameficacao.semcomp.com.br' \
  'COOKIE_SECURE' \
  'COOKIE_SAME_SITE' \
  'SWAGGER_ENABLED' \
  'admin-only' \
  'semcomp-production'; do
  assert_contains "$exact_value" "$configure_source" "missing production value: $exact_value"
done
if grep -Eiq 'SEED_ADMIN_PASSWORD|PASSWORD_HASH|passwordHash' "$configure_script"; then
  fail 'administrative password material must not be an SSM parameter'
fi

for marker in 'status --porcelain' 'rev-parse --verify HEAD' "'build'" "'push'" \
  'NEXT_PUBLIC_API_URL=/api' 'describe-images' 'manifest.json' "'send-command'"; do
  assert_contains "$marker" "$publish_source" "publisher is missing: $marker"
done
assert_contains 'bcrypt' "$publish_source" 'publisher does not test bcrypt'
assert_contains '127.0.0.1:43100' "$publish_source" 'publisher does not test web health'
for secret_name in POSTGRES_PASSWORD JWT_SECRET RATE_LIMIT_KEY_SECRET; do
  assert_not_contains "$secret_name" "$publish_source" "publisher source contains secret: $secret_name"
done

for marker in 'get-parameters-by-path' '/semcomp/production/' '0600' 'BACKUP_BUCKET' \
  '/opt/semcomp/shared/nginx/active.conf' 'prisma' '/api/health' \
  'semcomp-certbot-renew.timer' 'semcomp-backup.timer'; do
  assert_contains "$marker" "$deploy_source" "deploy is missing: $marker"
done
if grep -Eq 'docker compose[^\n]*(build|--build)' "$deploy_script"; then
  fail 'production deploy must never build images on the host'
fi

for marker in 'releases/' 'head-object' 'backup' 'docker compose' '/api/health'; do
  assert_contains "$marker" "$rollback_source" "rollback is missing: $marker"
done
for marker in 'DEPLOY_ENV' 'https://' 'CONFIRM_ADMIN_PASSWORD' 'semcomp-production' \
  'run --rm --no-deps -T api'; do
  assert_contains "$marker" "$admin_source" "admin helper is missing: $marker"
done
assert_not_contains 'pass''word=' "$admin_source" 'admin password must not be accepted as an environment value'

test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
bin_dir="$test_root/bin"
capture_dir="$test_root/capture"
mkdir -p "$bin_dir" "$capture_dir/aws"

cat > "$bin_dir/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
to_posix_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u -- "$1"; else printf '%s' "$1"; fi
}
aws_calls="$(to_posix_path "$AWS_CALLS")"
aws_mutations="$(to_posix_path "$AWS_MUTATIONS")"
aws_capture_dir="$(to_posix_path "$AWS_CAPTURE_DIR")"
args="$*"
printf '%s\n' "$args" >> "$aws_calls"
case "$args" in
  'configure get region'*) printf '%s\n' "${FAKE_CONFIGURED_REGION:-sa-east-1}" ;;
  *'sts get-caller-identity'*) printf '%s\n' "${FAKE_ACCOUNT:-000000000000}" ;;
  *'ssm put-parameter'*)
    printf '%s\n' mutation >> "$aws_mutations"
    for arg in "$@"; do
      if [[ "$arg" == file://* ]]; then
        parameter_path="$(printf '%s' "$arg" | sed 's#^file://##')"
        cp -- "$(to_posix_path "$parameter_path")" "$aws_capture_dir/parameter-$RANDOM.json"
      fi
    done
    ;;
  *'cloudformation describe-stacks'*'ApiRepositoryUri'*) printf '%s\n' '123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/api' ;;
  *'cloudformation describe-stacks'*'WebRepositoryUri'*) printf '%s\n' '123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/web' ;;
  *'cloudformation describe-stacks'*'BackupBucketName'*) printf '%s\n' 'semcomp-production-artifacts' ;;
  *'cloudformation describe-stacks'*'InstanceId'*) printf '%s\n' 'i-0123456789abcdef0' ;;
  *'ecr get-login-password'*) printf '%s\n' fake-ecr-password ;;
  *'ecr describe-images'*semcomp-production/api*) printf '%s\n' 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ;;
  *'ecr describe-images'*) printf '%s\n' 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' ;;
  *'ssm send-command'*)
    printf '%s\n' mutation >> "$aws_mutations"
    for arg in "$@"; do
      if [[ "$arg" == file://* ]]; then
        command_path="$(printf '%s' "$arg" | sed 's#^file://##')"
        cp -- "$(to_posix_path "$command_path")" "$aws_capture_dir/ssm-command.json"
      fi
    done
    printf '%s\n' 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ;;
  *'ssm get-command-invocation'*) printf 'Success\t0\n' ;;
  *'s3api head-object'*)
    if [[ -v AWS_HEAD_OBJECT_FAIL ]]; then exit 1; fi
    printf '%s\n' '{"ContentLength":1}'
    ;;
  *'s3 cp'*)
    printf '%s\n' mutation >> "$aws_mutations"
    positional_args=()
    skip_next=0
    for arg in "$@"; do
      if (( skip_next == 1 )); then
        skip_next=0
      elif [[ "$arg" == '--region' ]]; then
        skip_next=1
      elif [[ "$arg" == --* || "$arg" == aws || "$arg" == s3 || "$arg" == cp ]]; then
        :
      else
        positional_args+=("$arg")
      fi
    done
    if [[ "${positional_args[0]:-}" == s3://* ]]; then
      download_source="$(to_posix_path "${AWS_ROLLBACK_MANIFEST:-}")"
      [[ -n "$download_source" && -f "$download_source" ]] || exit 1
      cp -- "$download_source" "${positional_args[1]}"
    elif [[ "${positional_args[1]:-}" == s3://* ]]; then
      cp -- "$(to_posix_path "${positional_args[0]}")" "$aws_capture_dir/$(basename "${positional_args[1]}")"
    else
      exit 1
    fi
    ;;
  *'ssm get-parameters-by-path'*)
    printf '%s\t%s\n' \
      '/semcomp/production/POSTGRES_DB' semcomp_production \
      '/semcomp/production/POSTGRES_USER' semcomp_production \
      '/semcomp/production/POSTGRES_PASSWORD' production-postgres-secret \
      '/semcomp/production/POSTGRES_SCHEMA' public \
      '/semcomp/production/JWT_SECRET' production-jwt-secret \
      '/semcomp/production/RATE_LIMIT_KEY_SECRET' production-rate-secret \
      '/semcomp/production/FRONTEND_URL' https://gameficacao.semcomp.com.br \
      '/semcomp/production/COOKIE_SAME_SITE' lax \
      '/semcomp/production/COOKIE_SECURE' true \
      '/semcomp/production/NODE_ENV' production \
      '/semcomp/production/SWAGGER_ENABLED' false \
      '/semcomp/production/SEED_MODE' admin-only \
      '/semcomp/production/SEED_ADMIN_NAME' production-admin \
      '/semcomp/production/SEED_ADMIN_CPF' 12345678901 \
      '/semcomp/production/SEED_ADMIN_EMAIL' admin@semcomp.example \
      '/semcomp/production/COMPOSE_PROJECT_NAME' semcomp-production
    ;;
esac
EOF
chmod +x "$bin_dir/aws"

cat > "$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
to_posix_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u -- "$1"; else printf '%s' "$1"; fi
}
printf '%s\n' "$*" >> "$(to_posix_path "$DOCKER_CALLS")"
if [[ "$*" == *'login --username AWS'* ]]; then
  cat >/dev/null
fi
if [[ "$*" == *'run --rm --no-deps -T api'* && -v DOCKER_STDIN_CAPTURE ]]; then
  cat > "$(to_posix_path "$DOCKER_STDIN_CAPTURE")"
fi
docker_exit_code=0
if [[ -v DOCKER_EXIT_CODE ]]; then docker_exit_code="$DOCKER_EXIT_CODE"; fi
if [[ "$*" == *'run --detach'* ]]; then printf '%s\n' web-health-container; fi
exit "$docker_exit_code"
EOF
chmod +x "$bin_dir/docker"

cat > "$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
to_posix_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u -- "$1"; else printf '%s' "$1"; fi
}
printf '%s\n' "$*" >> "$(to_posix_path "$CURL_CALLS")"
if [[ -v CURL_FAIL_ONCE_FILE ]]; then
  curl_fail_once_file="$(to_posix_path "$CURL_FAIL_ONCE_FILE")"
  if [[ ! -e "$curl_fail_once_file" ]]; then
    : > "$curl_fail_once_file"
    exit 1
  fi
fi
curl_exit_code=0
if [[ -v CURL_EXIT_CODE ]]; then curl_exit_code="$CURL_EXIT_CODE"; fi
exit "$curl_exit_code"
EOF
chmod +x "$bin_dir/curl"

cat > "$bin_dir/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
to_posix_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u -- "$1"; else printf '%s' "$1"; fi
}
printf '%s\n' "$*" >> "$(to_posix_path "$SYSTEMCTL_CALLS")"
EOF
chmod +x "$bin_dir/systemctl"

for fake_command in aws docker curl systemctl; do
  cat > "$bin_dir/$fake_command.cmd" <<EOF
@echo off
"C:\\Program Files\\Git\\usr\\bin\\bash.exe" "%~dp0$fake_command" %*
exit /b %errorlevel%
EOF
done

export PATH="$bin_dir:$PATH"
export AWS_CALLS="$capture_dir/aws.calls"
export AWS_MUTATIONS="$capture_dir/aws.mutations"
export AWS_CAPTURE_DIR="$capture_dir/aws"
export DOCKER_CALLS="$capture_dir/docker.calls"
export CURL_CALLS="$capture_dir/curl.calls"
export SYSTEMCTL_CALLS="$capture_dir/systemctl.calls"
: > "$AWS_CALLS"
: > "$AWS_MUTATIONS"
: > "$DOCKER_CALLS"
: > "$CURL_CALLS"
: > "$SYSTEMCTL_CALLS"

if command -v pwsh >/dev/null 2>&1; then

run_pwsh() {
  env FAKE_CONFIGURED_REGION="${FAKE_CONFIGURED_REGION:-}" \
    FAKE_ACCOUNT="${FAKE_ACCOUNT:-}" \
    pwsh -NoProfile -NonInteractive -File "$1" "${@:2}"
}

output=''
status=0
set +e
output="$(FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
  run_pwsh "$configure_script" -ExpectedAccountId 000000000000 -Region us-east-1 -StackName semcomp-production 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'wrong-region configuration unexpectedly succeeded'
[[ ! -s "$AWS_MUTATIONS" ]] || fail 'wrong-region configuration mutated AWS'
assert_contains 'sa-east-1' "$output" 'wrong-region failure omitted required region'

output=''
set +e
output="$(FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=999999999999 \
  run_pwsh "$configure_script" -ExpectedAccountId 000000000000 -Region sa-east-1 -StackName semcomp-production 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'wrong-account configuration unexpectedly succeeded'
[[ ! -s "$AWS_MUTATIONS" ]] || fail 'wrong-account configuration mutated AWS'
assert_contains 'account' "$output" 'wrong-account failure omitted account validation'

export SEED_ADMIN_NAME='Production Admin'
export SEED_ADMIN_CPF='123.456.789-01'
export SEED_ADMIN_EMAIL='admin@semcomp.example'
FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
  run_pwsh "$configure_script" -ExpectedAccountId 000000000000 -Region sa-east-1 -StackName semcomp-production >/dev/null
parameter_files=("$AWS_CAPTURE_DIR"/parameter-*.json)
[[ "${#parameter_files[@]}" -ge 3 ]] || fail 'configuration did not write parameters'
for secret_name in POSTGRES_PASSWORD JWT_SECRET RATE_LIMIT_KEY_SECRET; do
  found=''
  for parameter_file in "${parameter_files[@]}"; do
    if grep -Fq "$secret_name" "$parameter_file"; then found="$parameter_file"; break; fi
  done
  [[ -n "$found" ]] || fail "missing configured secret: $secret_name"
  assert_contains '"Type":"SecureString"' "$(<"$found")" "not SecureString: $secret_name"
  assert_not_contains '"Value":""' "$(<"$found")" "empty secret: $secret_name"
done
grep -Fq 'https://gameficacao.semcomp.com.br' "$AWS_CAPTURE_DIR"/*.json \
  || fail 'frontend URL was not exact'
if grep -Eiq 'SEED_ADMIN_PASSWORD|PASSWORD_HASH|passwordHash' "$AWS_CAPTURE_DIR"/*.json; then
  fail 'administrative password appeared in parameter payloads'
fi
unset SEED_ADMIN_NAME SEED_ADMIN_CPF SEED_ADMIN_EMAIL

publish_repo="$test_root/publish-repo"
mkdir -p "$publish_repo"
git -C "$publish_repo" init -q
git -C "$publish_repo" config user.email test@example.invalid
git -C "$publish_repo" config user.name 'Release Test'
printf 'fixture\n' > "$publish_repo/README.md"
git -C "$publish_repo" add README.md
git -C "$publish_repo" commit -qm 'release fixture'
printf 'dirty\n' > "$publish_repo/dirty.txt"
set +e
output="$(run_pwsh "$publish_script" -ExpectedAccountId 000000000000 -Region sa-east-1 \
  -StackName semcomp-production -RepositoryPath "$publish_repo" 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'publisher accepted dirty worktree'
assert_contains 'clean' "$output" 'dirty publisher failure omitted clean-worktree requirement'
rm -f "$publish_repo/dirty.txt"
: > "$DOCKER_CALLS"
CURL_FAIL_ONCE_FILE="$capture_dir/curl.fail-once" \
FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
  run_pwsh "$publish_script" -ExpectedAccountId 000000000000 -Region sa-east-1 \
  -StackName semcomp-production -RepositoryPath "$publish_repo" >/dev/null
[[ "$(wc -l < "$CURL_CALLS" | tr -d ' ')" -ge 2 ]] \
  || fail 'publisher did not retry a transient web health failure'
ssm_command_source="$(<"$AWS_CAPTURE_DIR/ssm-command.json")"
assert_contains 'set -eu\n' "$ssm_command_source" 'SSM wrapper did not enable POSIX fail-fast mode'
assert_not_contains 'pipefail' "$ssm_command_source" 'SSM wrapper requires Bash before Bash is invoked'
assert_not_contains '[[' "$ssm_command_source" 'SSM wrapper contains a Bash-only conditional'
release_sha="$(git -C "$publish_repo" rev-parse HEAD)"
docker_source="$(<"$DOCKER_CALLS")"
docker_source="${docker_source//\\//}"
assert_contains 'apps/api/Dockerfile' "$docker_source" 'API image was not built'
assert_contains 'apps/web/Dockerfile' "$docker_source" 'web image was not built'
assert_contains 'NEXT_PUBLIC_API_URL=/api' "$docker_source" 'web build omitted /api'
assert_contains "push 123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/api:$release_sha" \
  "$docker_source" 'API was not pushed by full SHA'
assert_contains "push 123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/web:$release_sha" \
  "$docker_source" 'web was not pushed by full SHA'
manifest_file="$AWS_CAPTURE_DIR/manifest.json"
[[ -f "$manifest_file" ]] || fail 'manifest was not uploaded'
manifest_source="$(<"$manifest_file")"
assert_contains "$release_sha" "$manifest_source" 'manifest omitted release SHA'
assert_contains 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  "$manifest_source" 'manifest omitted API digest'
assert_contains 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
  "$manifest_source" 'manifest omitted web digest'
for secret_value in production-postgres-secret production-jwt-secret production-rate-secret; do
  assert_not_contains "$secret_value" "$manifest_source" "manifest contains secret: $secret_value"
done

fi

if [[ "${OSTYPE:-}" != msys* && "${OSTYPE:-}" != cygwin* ]]; then
make_release_fixture() {
  local root="$1"
  local sha="$2"
  local previous="$3"
  mkdir -p "$root/releases/$sha/deploy/aws/production/scripts" \
    "$root/releases/$previous/deploy/aws/production/scripts" "$root/shared"
  cp "$deploy_script" "$root/releases/$sha/deploy/aws/production/scripts/deploy-release.sh"
  cp "$script_dir/../compose.yml" "$root/releases/$sha/deploy/aws/production/compose.yml"
  cp "$script_dir/../nginx-maintenance.conf" "$root/releases/$sha/deploy/aws/production/nginx-maintenance.conf"
  cp "$script_dir/../compose.yml" "$root/releases/$previous/deploy/aws/production/compose.yml"
  ln -s "$root/releases/$previous" "$root/current"
  printf 'COMPOSE_PROJECT_NAME=semcomp-production\n' > "$root/shared/production.env"
  chmod 600 "$root/shared/production.env"
  cat > "$root/releases/$sha/manifest.json" <<EOF
{
  "releaseSha": "$sha",
  "bucket": "semcomp-production-artifacts",
  "apiImage": "123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "webImage": "123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}
EOF
}

deploy_root="$test_root/deploy"
deploy_sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
previous_sha='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
make_release_fixture "$deploy_root" "$deploy_sha" "$previous_sha"
: > "$DOCKER_CALLS"
: > "$CURL_CALLS"
: > "$SYSTEMCTL_CALLS"
FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
DEPLOY_ENV=production AWS_REGION=sa-east-1 EXPECTED_AWS_ACCOUNT_ID=000000000000 \
RELEASE_SHA="$deploy_sha" RELEASE_BUCKET=semcomp-production-artifacts \
RELEASES_DIR="$deploy_root/releases" CURRENT_LINK="$deploy_root/current" \
SHARED_DIR="$deploy_root/shared" ENV_FILE="$deploy_root/shared/production.env" \
MANIFEST_FILE="$deploy_root/releases/$deploy_sha/manifest.json" HEALTHCHECK_TIMEOUT_SECONDS=0 \
bash "$deploy_root/releases/$deploy_sha/deploy/aws/production/scripts/deploy-release.sh" >/dev/null
[[ "$(readlink "$deploy_root/current")" == "$deploy_root/releases/$deploy_sha" ]] \
  || fail 'healthy deploy did not switch current'
[[ "$(stat -c '%a' "$deploy_root/shared/production.env")" == 600 ]] \
  || fail 'production env is not mode 0600'
deploy_env="$(<"$deploy_root/shared/production.env")"
assert_contains 'BACKUP_BUCKET=semcomp-production-artifacts' "$deploy_env" 'env omitted backup bucket'
assert_contains 'NGINX_CONFIG_FILE=/opt/semcomp/shared/nginx/active.conf' "$deploy_env" 'env omitted active Nginx'
cmp -s "$deploy_root/shared/nginx/active.conf" \
  "$deploy_root/releases/$deploy_sha/deploy/aws/production/nginx-maintenance.conf" \
  || fail 'first deploy did not seed the active Nginx configuration with maintenance mode'
assert_contains 'migrate' "$(<"$DOCKER_CALLS")" 'deploy omitted migration service'
assert_contains 'login --username AWS --password-stdin 123456789012.dkr.ecr.sa-east-1.amazonaws.com' \
  "$(<"$DOCKER_CALLS")" 'deploy did not authenticate Docker to the manifest ECR registry'
assert_contains '/api/health' "$(<"$CURL_CALLS")" 'deploy omitted health check'
assert_contains 'enable --now semcomp-certbot-renew.timer semcomp-backup.timer' \
  "$(<"$SYSTEMCTL_CALLS")" 'deploy did not start timers'

failure_root="$test_root/failure"
failure_sha='cccccccccccccccccccccccccccccccccccccccc'
failure_previous='dddddddddddddddddddddddddddddddddddddddd'
make_release_fixture "$failure_root" "$failure_sha" "$failure_previous"
: > "$DOCKER_CALLS"
set +e
CURL_EXIT_CODE=22 FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
DEPLOY_ENV=production AWS_REGION=sa-east-1 EXPECTED_AWS_ACCOUNT_ID=000000000000 \
RELEASE_SHA="$failure_sha" RELEASE_BUCKET=semcomp-production-artifacts \
RELEASES_DIR="$failure_root/releases" CURRENT_LINK="$failure_root/current" \
SHARED_DIR="$failure_root/shared" ENV_FILE="$failure_root/shared/production.env" \
MANIFEST_FILE="$failure_root/releases/$failure_sha/manifest.json" HEALTHCHECK_TIMEOUT_SECONDS=0 \
bash "$failure_root/releases/$failure_sha/deploy/aws/production/scripts/deploy-release.sh" >/dev/null 2>&1
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'unhealthy deploy unexpectedly succeeded'
[[ "$(readlink "$failure_root/current")" == "$failure_root/releases/$failure_previous" ]] \
  || fail 'health failure changed current'
assert_contains "$failure_root/releases/$failure_previous" "$(<"$DOCKER_CALLS")" \
  'health failure did not restart previous release'

invalid_root="$test_root/invalid-manifest"
invalid_sha='9999999999999999999999999999999999999999'
invalid_previous='8888888888888888888888888888888888888888'
make_release_fixture "$invalid_root" "$invalid_sha" "$invalid_previous"
cat > "$invalid_root/releases/$invalid_sha/manifest.json" <<EOF
{
  "releaseSha": "$invalid_sha",
  "bucket": "semcomp-production-artifacts",
  "apiImage": "123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/api:release-tag",
  "webImage": "123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}
EOF
: > "$DOCKER_CALLS"
set +e
FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
DEPLOY_ENV=production AWS_REGION=sa-east-1 EXPECTED_AWS_ACCOUNT_ID=000000000000 \
RELEASE_SHA="$invalid_sha" RELEASE_BUCKET=semcomp-production-artifacts \
RELEASES_DIR="$invalid_root/releases" CURRENT_LINK="$invalid_root/current" \
SHARED_DIR="$invalid_root/shared" ENV_FILE="$invalid_root/shared/production.env" \
MANIFEST_FILE="$invalid_root/releases/$invalid_sha/manifest.json" HEALTHCHECK_TIMEOUT_SECONDS=0 \
bash "$invalid_root/releases/$invalid_sha/deploy/aws/production/scripts/deploy-release.sh" >/dev/null 2>&1
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'deploy accepted a tag-only image reference'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'tag-only manifest started Docker before validation'

rollback_root="$test_root/rollback"
rollback_current_sha='1111111111111111111111111111111111111111'
rollback_target_sha='2222222222222222222222222222222222222222'
mkdir -p "$rollback_root/releases/$rollback_current_sha/deploy/aws/production/scripts" \
  "$rollback_root/releases/$rollback_target_sha/deploy/aws/production/scripts" "$rollback_root/shared"
cp "$script_dir/../compose.yml" "$rollback_root/releases/$rollback_current_sha/deploy/aws/production/compose.yml"
cp "$script_dir/../compose.yml" "$rollback_root/releases/$rollback_target_sha/deploy/aws/production/compose.yml"
cat > "$rollback_root/releases/$rollback_current_sha/deploy/aws/production/scripts/backup-postgres.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' backup-created > "$rollback_root/backup.marker"
EOF
chmod +x "$rollback_root/releases/$rollback_current_sha/deploy/aws/production/scripts/backup-postgres.sh"
ln -s "$rollback_root/releases/$rollback_current_sha" "$rollback_root/current"
cat > "$rollback_root/shared/production.env" <<'EOF'
COMPOSE_PROJECT_NAME=semcomp-production
API_IMAGE=123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
WEB_IMAGE=123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
BACKUP_BUCKET=semcomp-production-artifacts
NGINX_CONFIG_FILE=/opt/semcomp/shared/nginx/active.conf
EOF
chmod 600 "$rollback_root/shared/production.env"
rollback_manifest="$rollback_root/published-manifest.json"
cat > "$rollback_manifest" <<EOF
{
  "releaseSha": "$rollback_target_sha",
  "bucket": "semcomp-production-artifacts",
  "apiImage": "123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "webImage": "123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-production/web@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
}
EOF
: > "$DOCKER_CALLS"
: > "$CURL_CALLS"
FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
AWS_ROLLBACK_MANIFEST="$rollback_manifest" \
DEPLOY_ENV=production AWS_REGION=sa-east-1 EXPECTED_AWS_ACCOUNT_ID=000000000000 \
RELEASE_SHA="$rollback_target_sha" RELEASE_BUCKET=semcomp-production-artifacts \
RELEASES_DIR="$rollback_root/releases" CURRENT_LINK="$rollback_root/current" \
SHARED_DIR="$rollback_root/shared" ENV_FILE="$rollback_root/shared/production.env" HEALTHCHECK_TIMEOUT_SECONDS=0 \
bash "$rollback_script" >/dev/null
[[ "$(readlink "$rollback_root/current")" == "$rollback_root/releases/$rollback_target_sha" ]] \
  || fail 'published rollback did not switch current'
[[ -f "$rollback_root/backup.marker" ]] || fail 'rollback did not create a pre-rollback backup'
assert_contains "$rollback_root/releases/$rollback_target_sha" "$(<"$DOCKER_CALLS")" \
  'rollback did not start the target release'
assert_contains 'login --username AWS --password-stdin 123456789012.dkr.ecr.sa-east-1.amazonaws.com' \
  "$(<"$DOCKER_CALLS")" 'rollback did not authenticate Docker to the manifest ECR registry'
rollback_env_source="$(<"$rollback_root/shared/production.env")"
assert_contains 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' \
  "$rollback_env_source" 'rollback env did not use target API digest'

: > "$DOCKER_CALLS"
set +e
AWS_HEAD_OBJECT_FAIL=1 FAKE_CONFIGURED_REGION=sa-east-1 FAKE_ACCOUNT=000000000000 \
DEPLOY_ENV=production AWS_REGION=sa-east-1 EXPECTED_AWS_ACCOUNT_ID=000000000000 \
RELEASE_SHA=3333333333333333333333333333333333333333 RELEASE_BUCKET=semcomp-production-artifacts \
RELEASES_DIR="$rollback_root/releases" CURRENT_LINK="$rollback_root/current" \
SHARED_DIR="$rollback_root/shared" ENV_FILE="$rollback_root/shared/production.env" HEALTHCHECK_TIMEOUT_SECONDS=0 \
bash "$rollback_script" >/dev/null 2>&1
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'rollback accepted a manifest absent from the production bucket'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'unpublished rollback started Docker before manifest validation'

admin_root="$test_root/admin"
mkdir -p "$admin_root/deploy/aws/production" "$admin_root/shared"
cp "$script_dir/../compose.yml" "$admin_root/deploy/aws/production/compose.yml"
printf 'COMPOSE_PROJECT_NAME=semcomp-production\n' > "$admin_root/shared/production.env"
ln -s "$admin_root" "$admin_root/current"
admin_stdin="$capture_dir/admin.stdin"
: > "$admin_stdin"
: > "$DOCKER_CALLS"
printf '12345678901\nadmin@semcomp.example\nSecret123!\nSecret123!\n' | \
  DEPLOY_ENV=production CONFIRM_ADMIN_PASSWORD=semcomp-production \
  CURRENT_LINK="$admin_root/current" ENV_FILE="$admin_root/shared/production.env" \
  DOCKER_STDIN_CAPTURE="$admin_stdin" BASE_URL=https://gameficacao.semcomp.com.br \
  bash "$admin_password_script" >/dev/null
admin_calls="$(<"$DOCKER_CALLS")"
assert_contains 'run --rm --no-deps -T api' "$admin_calls" 'admin helper did not use protected stdin'
assert_not_contains 'Secret123!' "$admin_calls" 'admin password appeared in docker arguments'
assert_contains 'Secret123!' "$(<"$admin_stdin")" 'admin password was not forwarded by stdin'

fi

printf 'release scripts test: ok\n'
