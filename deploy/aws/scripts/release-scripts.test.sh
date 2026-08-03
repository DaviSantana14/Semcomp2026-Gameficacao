#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
configure_script="$script_dir/configure-parameters.ps1"
publish_script="$script_dir/publish.ps1"
deploy_script="$script_dir/deploy-release.sh"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

for required_file in "$configure_script" "$publish_script" "$deploy_script"; do
  [[ -f "$required_file" ]] || fail "missing release automation file: $required_file"
done

bash -n "$deploy_script"

grep -Fq '/semcomp/rehearsal/' "$configure_script" \
  || fail 'parameter path is not scoped to rehearsal'
grep -Fq 'SecureString' "$configure_script" \
  || fail 'secure parameter type is not configured'
for secret_name in POSTGRES_PASSWORD JWT_SECRET RATE_LIMIT_KEY_SECRET; do
  grep -Fq "$secret_name" "$configure_script" \
    || fail "missing generated secret parameter: $secret_name"
done

if grep -Eiq 'SEED_ADMIN_PASSWORD|PASSWORD_HASH|passwordHash' "$configure_script"; then
  fail 'administrative password material must not be an AWS parameter'
fi

grep -Fq 'archive --format=zip' "$publish_script" \
  || fail 'publisher does not package the commit archive'
grep -Fq 'releases/' "$publish_script" \
  || fail 'publisher does not target the releases prefix'
grep -Fq 'ssm send-command' "$publish_script" \
  || fail 'publisher does not dispatch through SSM'
grep -Fq 'wait command-executed' "$publish_script" \
  || fail 'publisher does not wait for SSM completion'

grep -Fq '0600' "$deploy_script" \
  || fail 'remote environment is not protected with mode 0600'
grep -Fq '/api/health' "$deploy_script" \
  || fail 'remote deployment does not validate health'
grep -Fq 'SEED_MODE' "$deploy_script" \
  || fail 'remote deployment does not use the configured seed mode'
grep -Fq 'ln -s' "$deploy_script" \
  || fail 'remote deployment does not switch the current symlink atomically'

test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

marker="$test_root/mutation-marker"
bin_dir="$test_root/bin"
mkdir -p "$bin_dir" "$test_root/releases"

cat > "$bin_dir/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${MUTATION_MARKER:?MUTATION_MARKER is required}"
printf '%s\n' "$*" >> "$MUTATION_MARKER"
EOF
chmod +x "$bin_dir/aws"

output=''
status=0
set +e
output="$(
  PATH="$bin_dir:$PATH" \
  AWS_REGION=us-east-1 \
  EXPECTED_AWS_ACCOUNT_ID=000000000000 \
  MUTATION_MARKER="$marker" \
  RELEASES_DIR="$test_root/releases" \
  CURRENT_LINK="$test_root/current" \
  bash "$deploy_script" 2>&1
)"
status=$?
set -e

[[ "$status" -ne 0 ]] || fail 'deploy must reject a region other than sa-east-1'
grep -Fq 'sa-east-1' <<<"$output" \
  || fail 'region gate did not explain the required region'
[[ ! -e "$marker" ]] || fail 'region gate mutated an external command'

rollback_root="$test_root/rollback"
rollback_bin="$rollback_root/bin"
release_sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
previous_sha='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
release_root="$rollback_root/releases/$release_sha"
previous_root="$rollback_root/releases/$previous_sha"
mkdir -p "$rollback_bin" "$release_root/deploy/aws/scripts" "$previous_root/deploy/aws"
cp "$deploy_script" "$release_root/deploy/aws/scripts/deploy-release.sh"
cp "$script_dir/../compose.yml" "$release_root/deploy/aws/compose.yml"
cp "$script_dir/../compose.yml" "$previous_root/deploy/aws/compose.yml"
ln -s "$previous_root" "$rollback_root/current"

cat > "$rollback_bin/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "$*" in
  'configure get region'*)
    printf 'sa-east-1\n'
    ;;
  *'sts get-caller-identity'*)
    printf '000000000000\n'
    ;;
  *'get-parameters-by-path'*)
    printf '%s\t%s\n' \
      '/semcomp/rehearsal/POSTGRES_DB' 'semcomp_rehearsal' \
      '/semcomp/rehearsal/POSTGRES_USER' 'semcomp_rehearsal' \
      '/semcomp/rehearsal/POSTGRES_PASSWORD' 'parameter-value' \
      '/semcomp/rehearsal/POSTGRES_SCHEMA' 'public' \
      '/semcomp/rehearsal/JWT_SECRET' 'parameter-value' \
      '/semcomp/rehearsal/RATE_LIMIT_KEY_SECRET' 'parameter-value' \
      '/semcomp/rehearsal/FRONTEND_URL' 'http://rehearsal.invalid' \
      '/semcomp/rehearsal/COOKIE_SAME_SITE' 'lax' \
      '/semcomp/rehearsal/COOKIE_SECURE' 'false' \
      '/semcomp/rehearsal/NODE_ENV' 'production' \
      '/semcomp/rehearsal/SWAGGER_ENABLED' 'false' \
      '/semcomp/rehearsal/SEED_MODE' 'admin-only' \
      '/semcomp/rehearsal/SEED_ADMIN_NAME' 'seed-admin' \
      '/semcomp/rehearsal/SEED_ADMIN_CPF' 'fixture-cpf' \
      '/semcomp/rehearsal/SEED_ADMIN_EMAIL' 'fixture-email' \
      '/semcomp/rehearsal/COMPOSE_PROJECT_NAME' 'semcomp-rehearsal'
    ;;
esac
EOF
chmod +x "$rollback_bin/aws"

cat > "$rollback_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_CAPTURE"
EOF
chmod +x "$rollback_bin/docker"

cat > "$rollback_bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 22
EOF
chmod +x "$rollback_bin/curl"

docker_capture="$rollback_root/docker.calls"
output=''
status=0
set +e
output="$(
  PATH="$rollback_bin:$PATH" \
  AWS_REGION=sa-east-1 \
  EXPECTED_AWS_ACCOUNT_ID=000000000000 \
  DEPLOY_ENV=rehearsal \
  RELEASE_SHA="$release_sha" \
  RELEASE_BUCKET=semcomp-rehearsal-artifacts \
  RELEASES_DIR="$rollback_root/releases" \
  CURRENT_LINK="$rollback_root/current" \
  SHARED_DIR="$rollback_root/shared" \
  HEALTHCHECK_TIMEOUT_SECONDS=0 \
  DOCKER_CAPTURE="$docker_capture" \
  bash "$release_root/deploy/aws/scripts/deploy-release.sh" 2>&1
)"
status=$?
set -e

[[ "$status" -ne 0 ]] || fail 'health failure must make the release command fail'
[[ "$(readlink "$rollback_root/current")" == "$previous_root" ]] \
  || fail 'health failure changed the current release symlink'
grep -Fq 'up -d --build' "$docker_capture" \
  || fail 'health failure did not rebuild the previous release during rollback'
[[ "$(stat -c '%a' "$rollback_root/shared/rehearsal.env")" == '600' ]] \
  || fail 'remote environment file is not mode 0600'

success_root="$test_root/success"
success_bin="$success_root/bin"
success_sha='cccccccccccccccccccccccccccccccccccccccc'
success_previous_sha='dddddddddddddddddddddddddddddddddddddddd'
success_old_one='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
success_old_two='ffffffffffffffffffffffffffffffffffffffff'
success_old_three='1111111111111111111111111111111111111111'
success_release_root="$success_root/releases/$success_sha"
mkdir -p "$success_bin" "$success_release_root/deploy/aws/scripts"
cp "$deploy_script" "$success_release_root/deploy/aws/scripts/deploy-release.sh"
cp "$script_dir/../compose.yml" "$success_release_root/deploy/aws/compose.yml"
mkdir -p "$success_root/releases/$success_previous_sha/deploy/aws"
mkdir -p "$success_root/releases/$success_old_one/deploy/aws"
mkdir -p "$success_root/releases/$success_old_two/deploy/aws"
mkdir -p "$success_root/releases/$success_old_three/deploy/aws"
cp "$script_dir/../compose.yml" "$success_root/releases/$success_previous_sha/deploy/aws/compose.yml"
cp "$script_dir/../compose.yml" "$success_root/releases/$success_old_one/deploy/aws/compose.yml"
cp "$script_dir/../compose.yml" "$success_root/releases/$success_old_two/deploy/aws/compose.yml"
cp "$script_dir/../compose.yml" "$success_root/releases/$success_old_three/deploy/aws/compose.yml"
ln -s "$success_root/releases/$success_previous_sha" "$success_root/current"
cp "$rollback_bin/aws" "$success_bin/aws"
cp "$rollback_bin/docker" "$success_bin/docker"
chmod +x "$success_bin/aws" "$success_bin/docker"
cat > "$success_bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$success_bin/curl"

success_docker_capture="$success_root/docker.calls"
output=''
status=0
set +e
output="$(
  PATH="$success_bin:$PATH" \
  AWS_REGION=sa-east-1 \
  EXPECTED_AWS_ACCOUNT_ID=000000000000 \
  DEPLOY_ENV=rehearsal \
  RELEASE_SHA="$success_sha" \
  RELEASE_BUCKET=semcomp-rehearsal-artifacts \
  RELEASES_DIR="$success_root/releases" \
  CURRENT_LINK="$success_root/current" \
  SHARED_DIR="$success_root/shared" \
  HEALTHCHECK_TIMEOUT_SECONDS=0 \
  DOCKER_CAPTURE="$success_docker_capture" \
  bash "$success_release_root/deploy/aws/scripts/deploy-release.sh" 2>&1
)"
status=$?
set -e

[[ "$status" -eq 0 ]] || fail "healthy release must succeed: $output"
[[ "$(readlink "$success_root/current")" == "$success_release_root" ]] \
  || fail 'healthy release did not switch the current symlink'
remaining_releases=0
for release_path in "$success_root/releases"/*; do
  [[ -d "$release_path" ]] || continue
  release_name="${release_path##*/}"
  [[ "$release_name" =~ ^[0-9a-f]{40}$ ]] || continue
  remaining_releases=$((remaining_releases + 1))
done
[[ "$remaining_releases" -eq 3 ]] \
  || fail 'release retention did not keep exactly the current release and two previous releases'

printf 'release scripts test: ok\n'
