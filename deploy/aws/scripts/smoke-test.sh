#!/usr/bin/env bash

set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../../.." && pwd)"
cd -- "$project_dir"

fail() {
  printf 'smoke test failed: %s\n' "$1" >&2
  exit 1
}

if [[ -v SMOKE_ADMIN_PASSWORD ]]; then
  fail 'administrative password must be entered interactively, not through the environment'
fi

base_url_input="${BASE_URL:-}"
[[ -n "$base_url_input" ]] || fail 'BASE_URL is required'

normalize_origin() {
  local input="$1"
  node --input-type=module -e '
    const url = new URL(process.argv[1]);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) process.exit(1);
    if (url.pathname !== "/" || url.search || url.hash) process.exit(1);
    process.stdout.write(url.origin);
  ' "$input"
}

if ! base_url="$(normalize_origin "$base_url_input" 2>/dev/null)"; then
  fail 'BASE_URL must be an HTTP or HTTPS origin without credentials or a path'
fi

origin_input="${SMOKE_ORIGIN:-$base_url}"
if ! origin="$(normalize_origin "$origin_input" 2>/dev/null)"; then
  fail 'SMOKE_ORIGIN must be an HTTP or HTTPS origin without credentials or a path'
fi

timeout_seconds="${SMOKE_TIMEOUT_SECONDS:-10}"
connect_timeout_seconds="${SMOKE_CONNECT_TIMEOUT_SECONDS:-3}"
run_id="$(node -e 'process.stdout.write(String(Date.now()))')"
tmp_dir="$(mktemp -d)"
cookie_jar="$tmp_dir/cookies.txt"
response_body="$tmp_dir/body"
response_headers="$tmp_dir/headers"
rate_limit_headers="$tmp_dir/rate-limit-headers"
: > "$cookie_jar"

participant_name='Marco 9 Smoke Participant'
participant_cpf_index=$((run_id % 899999000))
abuse_cpf_index=$((participant_cpf_index + 1))
participant_cpf="$(node --input-type=module -e '
  const { generateCpf } = await import("./scripts/load/cpf.mjs");
  process.stdout.write(generateCpf(Number(process.argv[1])));
' "$participant_cpf_index")"
abuse_cpf="$(node --input-type=module -e '
  const { generateCpf } = await import("./scripts/load/cpf.mjs");
  process.stdout.write(generateCpf(Number(process.argv[1])));
' "$abuse_cpf_index")"
participant_email="smoke-${run_id}@rehearsal.invalid"
abuse_email="smoke-abuse-${run_id}@rehearsal.invalid"

admin_cpf=''
admin_email=''
admin_password=''
csrf_token=''

cleanup() {
  unset admin_password csrf_token participant_cpf participant_email abuse_cpf abuse_email
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT

curl_base_args=(
  curl
  --silent
  --show-error
  --connect-timeout "$connect_timeout_seconds"
  --max-time "$timeout_seconds"
  --output "$response_body"
  --dump-header "$response_headers"
  --write-out '%{http_code}'
  --cookie "$cookie_jar"
  --cookie-jar "$cookie_jar"
  --header 'Accept: application/json'
)

request_get() {
  local method="$1"
  local url="$2"
  local request_origin="${3:-}"
  local forwarded_for="${4:-}"
  local -a args=("${curl_base_args[@]}" --request "$method" "$url")

  if [[ -n "$request_origin" ]]; then
    args+=(--header "Origin: $request_origin")
  fi
  if [[ -n "$forwarded_for" ]]; then
    args+=(--header "X-Forwarded-For: $forwarded_for")
  fi

  "${args[@]}"
}

request_without_body() {
  local method="$1"
  local url="$2"
  local request_origin="${3:-}"
  local csrf_header="${4:-}"
  local forwarded_for="${5:-}"
  local -a args=("${curl_base_args[@]}" --request "$method" "$url")

  if [[ -n "$request_origin" ]]; then
    args+=(--header "Origin: $request_origin")
  fi
  if [[ -n "$csrf_header" ]]; then
    args+=(--header "X-CSRF-Token: $csrf_header")
  fi
  if [[ -n "$forwarded_for" ]]; then
    args+=(--header "X-Forwarded-For: $forwarded_for")
  fi

  "${args[@]}"
}

request_from_stdin() {
  local method="$1"
  local url="$2"
  local request_origin="${3:-}"
  local csrf_header="${4:-}"
  local forwarded_for="${5:-}"
  local -a args=(
    "${curl_base_args[@]}"
    --request "$method"
    --header 'Content-Type: application/json'
    --data-binary '@-'
    "$url"
  )

  if [[ -n "$request_origin" ]]; then
    args+=(--header "Origin: $request_origin")
  fi
  if [[ -n "$csrf_header" ]]; then
    args+=(--header "X-CSRF-Token: $csrf_header")
  fi
  if [[ -n "$forwarded_for" ]]; then
    args+=(--header "X-Forwarded-For: $forwarded_for")
  fi

  "${args[@]}"
}

json_object_from_stdin() {
  local shape="$1"
  node --input-type=module -e '
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const values = Buffer.concat(chunks).toString("utf8").split("\0");
    const shape = process.argv[1];
    let value;
    if (shape === "registration") {
      value = { name: values[0], cpf: values[1], email: values[2] };
    } else if (shape === "participant-login") {
      value = { cpf: values[0], email: values[1] };
    } else if (shape === "admin-missing") {
      value = { cpf: values[0], email: values[1] };
    } else if (shape === "admin-login") {
      value = { cpf: values[0], email: values[1], password: values[2] };
    } else {
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(value));
  ' "$shape"
}

extract_json_string() {
  local field="$1"
  node --input-type=module -e '
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))[process.argv[1]];
    if (typeof value !== "string" || value.length === 0) process.exit(1);
    process.stdout.write(value);
  ' "$field"
}

expect_status() {
  local actual="$1"
  local expected="$2"
  local operation="$3"
  [[ "$actual" == "$expected" ]] || fail "$operation returned an unexpected HTTP status"
}

assert_header() {
  local name="$1"
  local pattern="$2"
  local operation="$3"
  grep -Eiq "^${name}:[[:space:]]*${pattern}" "$response_headers" \
    || fail "$operation did not include the required security header"
}

assert_no_header() {
  local name="$1"
  local operation="$2"
  if grep -Eiq "^${name}:" "$response_headers"; then
    fail "$operation included a forbidden security header"
  fi
}

if ! status="$(request_get GET "$base_url/health" "$origin" 2>/dev/null)"; then
  fail 'health request could not be completed'
fi
expect_status "$status" 200 'health'
grep -Fq '"status":"ok"' "$response_body" || fail 'health response was not healthy'
assert_header 'X-Frame-Options' 'DENY' 'health'
assert_header 'X-Content-Type-Options' 'nosniff' 'health'
assert_header 'Referrer-Policy' '.+' 'health'
assert_header 'Permissions-Policy' '.+' 'health'
assert_no_header 'Strict-Transport-Security' 'HTTP rehearsal'

if ! status="$(
  printf '%s\0%s\0%s\0' "$participant_name" "$participant_cpf" "$participant_email" |
    json_object_from_stdin registration |
    request_from_stdin POST "$base_url/auth/register" "$origin"
)"; then
  fail 'participant registration request could not be completed'
fi
expect_status "$status" 201 'participant registration'

if ! status="$(
  printf '%s\0%s\0' "$participant_cpf" "$participant_email" |
    json_object_from_stdin participant-login |
    request_from_stdin POST "$base_url/auth/login" "$origin"
)"; then
  fail 'participant login request could not be completed'
fi
expect_status "$status" 200 'participant login'
if ! csrf_token="$(extract_json_string csrfToken < "$response_body")"; then
  fail 'participant login did not return a CSRF token'
fi

if ! status="$(request_get GET "$base_url/users/me" "$origin" 2>/dev/null)"; then
  fail 'authenticated session request could not be completed'
fi
expect_status "$status" 200 'authenticated session'

if ! status="$(request_get GET "$base_url/ranking?limit=10&period=all" "$origin" 2>/dev/null)"; then
  fail 'ranking request could not be completed'
fi
expect_status "$status" 200 'ranking'

if ! status="$(request_without_body POST "$base_url/auth/logout" "$origin" "$csrf_token" 2>/dev/null)"; then
  fail 'participant logout request could not be completed'
fi
expect_status "$status" 204 'participant logout'
csrf_token=''

if ! status="$(request_get GET "$base_url/docs" "$origin" 2>/dev/null)"; then
  fail 'Swagger availability request could not be completed'
fi
expect_status "$status" 404 'Swagger-disabled check'

if ! status="$(
  node --input-type=module -e '
    process.stdout.write(JSON.stringify({
      name: "x".repeat(131072),
      cpf: process.argv[1],
      email: process.argv[2],
    }));
  ' "$participant_cpf" "$participant_email" |
    request_from_stdin POST "$base_url/auth/register" "$origin"
)"; then
  fail 'oversized request could not be completed'
fi
expect_status "$status" 413 'oversized request'

rate_limit_status=''
for attempt in 1 2 3 4 5 6 7 8; do
  if ! status="$(
    printf '%s\0%s\0' "$abuse_cpf" "$abuse_email" |
      json_object_from_stdin participant-login |
      request_from_stdin POST "$base_url/auth/login" "$origin"
  )"; then
    fail 'rate-limit request could not be completed'
  fi
  if [[ "$status" == 429 ]]; then
    rate_limit_status=429
    cp -- "$response_headers" "$rate_limit_headers"
    break
  fi
done
[[ "$rate_limit_status" == 429 ]] || fail 'abuse scenario did not receive HTTP 429'
grep -Eiq '^Retry-After:[[:space:]]*[0-9]+' "$rate_limit_headers" \
  || fail 'rate-limit response did not include Retry-After'
grep -Eiq '^X-RateLimit-Limit:[[:space:]]*[0-9]+' "$rate_limit_headers" \
  || fail 'rate-limit response did not include limit headers'

public_host="$(node --input-type=module -e '
  process.stdout.write(new URL(process.argv[1]).hostname);
' "$base_url")"
if node --input-type=module -e '
  import net from "node:net";
  const socket = net.createConnection({ host: process.argv[1], port: 5432 });
  const timer = setTimeout(() => {
    socket.destroy();
    process.exit(1);
  }, 2500);
  socket.once("connect", () => {
    clearTimeout(timer);
    socket.destroy();
    process.exit(0);
  });
  socket.once("error", () => {
    clearTimeout(timer);
    process.exit(1);
  });
' "$public_host"; then
  fail 'PostgreSQL responded on public port 5432'
fi

xff_rate_limit_status=''
for attempt in $(seq 1 75); do
  forged_ip="198.51.100.$((attempt % 250 + 1))"
  if ! status="$(request_get GET "$base_url/health" "$origin" "$forged_ip" 2>/dev/null)"; then
    fail 'X-Forwarded-For spoofing request could not be completed'
  fi
  if [[ "$status" == 429 ]]; then
    xff_rate_limit_status=429
    break
  fi
done
[[ "$xff_rate_limit_status" == 429 ]] \
  || fail 'varying forged X-Forwarded-For values bypassed the health limit'

if [[ -n "${SMOKE_ADMIN_CPF:-}" ]]; then
  admin_cpf="$SMOKE_ADMIN_CPF"
else
  read -r -p 'Admin CPF: ' admin_cpf || fail 'administrator CPF input was unavailable'
fi
if [[ -n "${SMOKE_ADMIN_EMAIL:-}" ]]; then
  admin_email="$SMOKE_ADMIN_EMAIL"
else
  read -r -p 'Admin email: ' admin_email || fail 'administrator email input was unavailable'
fi
read -r -s -p 'Admin password: ' admin_password \
  || fail 'protected administrator password input was unavailable'
printf '\n' >&2

if ! status="$(
  printf '%s\0%s\0' "$admin_cpf" "$admin_email" |
    json_object_from_stdin admin-missing |
    request_from_stdin POST "$base_url/auth/admin/login" "$origin"
)"; then
  fail 'administrator missing-password request could not be completed'
fi
expect_status "$status" 400 'administrator missing-password login'

wrong_password="invalid-${run_id}"
if ! status="$(
  printf '%s\0%s\0%s\0' "$admin_cpf" "$admin_email" "$wrong_password" |
    json_object_from_stdin admin-login |
    request_from_stdin POST "$base_url/auth/admin/login" "$origin"
)"; then
  fail 'administrator incorrect-password request could not be completed'
fi
expect_status "$status" 401 'administrator incorrect-password login'

if ! status="$(
  printf '%s\0%s\0%s\0' "$admin_cpf" "$admin_email" "$admin_password" |
    json_object_from_stdin admin-login |
    request_from_stdin POST "$base_url/auth/admin/login" "$origin"
)"; then
  fail 'administrator valid-password request could not be completed'
fi
expect_status "$status" 200 'administrator valid-password login'
if ! csrf_token="$(extract_json_string csrfToken < "$response_body")"; then
  fail 'administrator login did not return a CSRF token'
fi

if ! status="$(request_get GET "$base_url/admin/dashboard" "$origin" 2>/dev/null)"; then
  fail 'administrator session request could not be completed'
fi
expect_status "$status" 200 'administrator session'

if ! status="$(request_without_body POST "$base_url/auth/logout" "$origin" "$csrf_token" 2>/dev/null)"; then
  fail 'administrator logout request could not be completed'
fi
expect_status "$status" 204 'administrator logout'

unset admin_password csrf_token
printf 'smoke test passed: health, auth, security limits, headers, and port isolation\n'
