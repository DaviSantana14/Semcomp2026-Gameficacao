#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
smoke_script="$script_dir/smoke-test.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local needle="$1"
  local haystack="$2"
  local message="$3"
  [[ "$haystack" == *"$needle"* ]] || fail "$message"
}

assert_not_contains() {
  local needle="$1"
  local haystack="$2"
  local message="$3"
  [[ "$haystack" != *"$needle"* ]] || fail "$message"
}

[[ -f "$smoke_script" ]] || fail "missing smoke test script: $smoke_script"
bash -n "$smoke_script"

test_root="$(mktemp -d "${TMPDIR:-/tmp}/semcomp-smoke-test.XXXXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

bin_dir="$test_root/bin"
release_root="$test_root/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
shared_dir="$test_root/shared"
current_link="$test_root/current"
env_file="$shared_dir/production.env"
mkdir -p "$bin_dir" "$release_root/deploy/aws/production" "$shared_dir" "$test_root/tmp"
printf 'services:\n' > "$release_root/deploy/aws/production/compose.yml"
printf 'COMPOSE_PROJECT_NAME=semcomp-production\n' > "$env_file"
ln -s -- "$release_root" "$current_link"

cat > "$bin_dir/dig" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "${DIG_RESULT:-203.0.113.11}"
EOF

cat > "$bin_dir/openssl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$OPENSSL_CALLS"
case "${1:-}" in
  s_client)
    printf '%s\n' '-----BEGIN CERTIFICATE-----' 'mock' '-----END CERTIFICATE-----'
    ;;
  x509)
    [[ "${CERT_MODE:-valid}" == 'valid' ]]
    ;;
  *)
    exit 2
    ;;
esac
EOF

cat > "$bin_dir/nc" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$NC_CALLS"
if [[ "${NC_MODE:-closed}" == 'open' ]]; then
  exit 0
fi
exit 1
EOF

cat > "$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_CALLS"
case "$*" in
  *' logs '*|*' logs')
    if [[ "${LOG_MODE:-clean}" == 'sensitive' ]]; then
      printf '%s\n' 'request email=fake@example.com cpf=123.456.789-00 Cookie: private-cookie password:private-value'
    elif [[ "${LOG_MODE:-clean}" == 'ip' ]]; then
      printf '%s\n' '198.51.100.42 - - [24/Aug/2026:12:00:00 +0000] "GET / HTTP/1.1" 200'
    else
      printf '%s\n' 'production logs contain no sensitive values'
    fi
    ;;
esac
EOF

cat > "$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

args=("$@")
args_string="$*"
printf '%s\n' "$args_string" >> "$CURL_CALLS"

output_file=''
header_file=''
write_format=''
cookie_jar=''
for ((index = 0; index < ${#args[@]}; index += 1)); do
  case "${args[index]}" in
    -o|--output)
      index=$((index + 1))
      output_file="${args[index]}"
      ;;
    -D|--dump-header)
      index=$((index + 1))
      header_file="${args[index]}"
      ;;
    -w|--write-out)
      index=$((index + 1))
      write_format="${args[index]}"
      ;;
    -c|--cookie-jar)
      index=$((index + 1))
      cookie_jar="${args[index]}"
      ;;
  esac
done

url="${args[${#args[@]} - 1]}"
status='200'
body=''
headers=''
cookie_name='access_token'

common_headers() {
  case "${HEADER_MODE:-enforcement}" in
    enforcement)
      cat <<'HEADERS'
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(self)

HEADERS
      ;;
    report-only)
      cat <<'HEADERS'
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy-Report-Only: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(self)

HEADERS
      ;;
    *)
      printf 'HTTP/1.1 200 OK\r\n\r\n'
      ;;
  esac
}

case "$url" in
  "http://gameficacao.semcomp.com.br/.well-known/acme-challenge/"*)
    status="${ACME_STATUS:-404}"
    headers="HTTP/1.1 $status\r\n\r\n"
    ;;
  "http://gameficacao.semcomp.com.br/"*)
    status="${HTTP_STATUS:-301}"
    redirect_location='https://gameficacao.semcomp.com.br/'
    if [[ "${REDIRECT_MODE:-valid}" == 'wrong' ]]; then
      redirect_location='https://gameficacao.semcomp.com.br/wrong-target'
    fi
    headers="HTTP/1.1 $status\r\nLocation: $redirect_location\r\n\r\n"
    ;;
  "https://gameficacao.semcomp.com.br/"|"https://gameficacao.semcomp.com.br")
    headers="$(common_headers)"
    ;;
  "https://gameficacao.semcomp.com.br/api/health")
    status="${HEALTH_STATUS:-200}"
    body='{"status":"ok"}'
    ;;
  "https://gameficacao.semcomp.com.br/api/docs")
    status="${DOCS_STATUS:-404}"
    ;;
  "https://gameficacao.semcomp.com.br/api/auth/login")
    status="${LOGIN_STATUS:-200}"
    body='{"csrfToken":"participant-csrf","user":{"role":"PARTICIPANT"}}'
    if [[ "${COOKIE_MODE:-valid}" == 'invalid' || "${PARTICIPANT_COOKIE_MODE:-valid}" == 'invalid' ]]; then
      headers='HTTP/1.1 200 OK\r\n\r\n'
    else
      headers="HTTP/1.1 200 OK\r\nSet-Cookie: ${cookie_name}=participant-token; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax\r\n\r\n"
    fi
    ;;
  "https://gameficacao.semcomp.com.br/api/auth/admin/login")
    status="${ADMIN_LOGIN_STATUS:-200}"
    body='{"csrfToken":"admin-csrf","user":{"role":"ADMIN"}}'
    if [[ "${ADMIN_COOKIE_MODE:-valid}" == 'invalid' ]]; then
      headers='HTTP/1.1 200 OK\r\n\r\n'
    else
      headers="HTTP/1.1 200 OK\r\nSet-Cookie: ${cookie_name}=admin-token; Max-Age=14400; Path=/; HttpOnly; Secure; SameSite=Lax\r\n\r\n"
    fi
    ;;
  "https://gameficacao.semcomp.com.br/api/auth/heartbeat")
    status="${HEARTBEAT_STATUS:-204}"
    ;;
  "https://gameficacao.semcomp.com.br/api/admin/dashboard")
    status="${DASHBOARD_STATUS:-200}"
    body='{"participants":{"total":1}}'
    ;;
  "https://gameficacao.semcomp.com.br/api/auth/logout")
    status="${LOGOUT_STATUS:-204}"
    ;;
  *)
    status='404'
    ;;
esac

if [[ -n "$header_file" ]]; then
  printf '%b' "$headers" > "$header_file"
elif [[ "$args_string" == *'--head'* ]]; then
  printf '%b' "$headers"
fi
if [[ -n "$output_file" ]]; then
  printf '%s' "$body" > "$output_file"
fi
if [[ -n "$cookie_jar" && ( "$url" == *'/auth/login' || "$url" == *'/auth/admin/login' ) ]]; then
  printf '# mock cookie jar\n' > "$cookie_jar"
fi
if [[ -n "$write_format" ]]; then
  printf '%s' "$status"
fi
EOF

chmod +x "$bin_dir"/*

export CURL_CALLS="$test_root/curl.calls"
export DOCKER_CALLS="$test_root/docker.calls"
export NC_CALLS="$test_root/nc.calls"
export OPENSSL_CALLS="$test_root/openssl.calls"
: > "$CURL_CALLS"
: > "$DOCKER_CALLS"
: > "$NC_CALLS"
: > "$OPENSSL_CALLS"

run_smoke() {
  printf '%s\n' \
    '123.456.789-00' \
    'admin@example.com' \
    'AdminSecret!123' \
    'participant@example.com' \
    'ParticipantSecret!123' |
    env \
      PATH="$bin_dir:$PATH" \
      DEPLOY_ENV=production \
      BASE_URL=https://gameficacao.semcomp.com.br \
      EXPECTED_ELASTIC_IP=203.0.113.11 \
      CURRENT_LINK="$current_link" \
      ENV_FILE="$env_file" \
      COMPOSE_PROJECT_NAME=semcomp-production \
      TMPDIR="$test_root/tmp" \
      "$@" bash "$smoke_script"
}

smoke_source="$(<"$smoke_script")"
assert_contains 'read -r -s -p' "$smoke_source" 'smoke did not read passwords with read -s'
assert_contains '/auth/logout' "$smoke_source" 'smoke did not include logout cleanup'
assert_not_contains '/auth/register' "$smoke_source" 'smoke creates a participant through registration'
assert_not_contains '/claim' "$smoke_source" 'smoke mutates claim-code data'
assert_not_contains '/rewards' "$smoke_source" 'smoke mutates reward data'
assert_not_contains 'ADMIN_PASSWORD=' "$smoke_source" 'admin password can be injected through the environment'
assert_not_contains 'PARTICIPANT_PASSWORD=' "$smoke_source" 'participant password can be injected through the environment'

set +e
output="$(run_smoke BASE_URL=https://example.com 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted a URL other than the production hostname'
assert_contains 'BASE_URL' "$output" 'URL validation failure omitted its cause'

: > "$CURL_CALLS"
set +e
output="$(run_smoke DIG_RESULT=203.0.113.10 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted a DNS record different from the expected EIP'
assert_contains 'DNS' "$output" 'DNS failure omitted its cause'
[[ ! -s "$CURL_CALLS" ]] || fail 'smoke reached HTTP before validating DNS'

set +e
output="$(run_smoke HTTP_STATUS=200 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted HTTP without an HTTPS redirect'
assert_contains 'HTTP' "$output" 'HTTP redirect failure omitted its cause'

set +e
output="$(run_smoke REDIRECT_MODE=wrong 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted a redirect to a non-production URL'
assert_contains 'exact HTTPS' "$output" 'wrong redirect target failure omitted its cause'

set +e
output="$(run_smoke ACME_STATUS=301 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted an ACME challenge redirect'
assert_contains 'ACME' "$output" 'ACME exception failure omitted its cause'

set +e
output="$(run_smoke CERT_MODE=expired 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted an expired certificate'
assert_contains 'certificate' "$output" 'certificate failure omitted its cause'

set +e
output="$(run_smoke HEADER_MODE=report-only CSP_EXPECTED_MODE=enforcement 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted report-only CSP as enforcement'
assert_contains 'CSP' "$output" 'CSP failure omitted its cause'

set +e
output="$(run_smoke HEADER_MODE=report-only 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted report-only CSP by default'
assert_contains 'CSP' "$output" 'default CSP enforcement failure omitted its cause'

output="$(run_smoke HEADER_MODE=report-only CSP_EXPECTED_MODE=report-only 2>&1)"
assert_contains 'PASS: security headers' "$output" 'explicit report-only smoke mode failed unexpectedly'

set +e
output="$(run_smoke HEALTH_STATUS=503 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted an unhealthy API response'
assert_contains 'health' "$output" 'health failure omitted its cause'

set +e
output="$(run_smoke DOCS_STATUS=200 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted an exposed API docs endpoint'
assert_contains 'docs' "$output" 'docs failure omitted its cause'

set +e
output="$(run_smoke NC_MODE=open 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted a publicly reachable private port'
assert_contains 'port' "$output" 'private-port failure omitted its cause'

set +e
output="$(run_smoke LOG_MODE=sensitive 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted sensitive values in production logs'
assert_not_contains 'fake@example.com' "$output" 'log scan printed an email value'
assert_not_contains '123.456.789-00' "$output" 'log scan printed a CPF value'
assert_not_contains 'private-cookie' "$output" 'log scan printed a cookie value'
assert_not_contains 'private-value' "$output" 'log scan printed a secret value'

output="$(run_smoke LOG_MODE=ip 2>&1)"
assert_contains 'PASS: production logs contain no sensitive values' "$output" \
  'smoke confused an IPv4 access-log address with a CPF'

: > "$CURL_CALLS"
output="$(run_smoke SMOKE_SCOPE=edge HEADER_MODE=report-only CSP_EXPECTED_MODE=report-only 2>&1)"
assert_contains 'PASS: edge smoke complete' "$output" 'edge smoke did not complete after infrastructure gates'
assert_not_contains '/auth/login' "$(<"$CURL_CALLS")" 'edge smoke attempted participant authentication'
assert_not_contains '/auth/admin/login' "$(<"$CURL_CALLS")" 'edge smoke attempted administrator authentication'

set +e
output="$(run_smoke COOKIE_MODE=invalid 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted participant cookies without security attributes'
assert_contains 'cookie' "$output" 'cookie failure omitted its cause'

set +e
output="$(run_smoke ADMIN_COOKIE_MODE=invalid 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted admin cookies without security attributes'
assert_contains 'cookie' "$output" 'admin cookie failure omitted its cause'

set +e
output="$(run_smoke HEARTBEAT_STATUS=500 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted a failed participant heartbeat'
assert_contains 'heartbeat' "$output" 'heartbeat failure omitted its cause'

set +e
output="$(run_smoke DASHBOARD_STATUS=500 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 ]] || fail 'smoke accepted a failed admin dashboard request'
assert_contains 'dashboard' "$output" 'dashboard failure omitted its cause'
logout_calls="$(grep -c '/api/auth/logout' "$CURL_CALLS" || true)"
[[ "$logout_calls" -ge 2 ]] || fail 'smoke did not logout authenticated sessions after a dashboard failure'

: > "$CURL_CALLS"
: > "$DOCKER_CALLS"
: > "$NC_CALLS"
: > "$OPENSSL_CALLS"
output="$(run_smoke)"
assert_contains 'PASS: DNS A record' "$output" 'successful smoke omitted DNS gate'
assert_contains 'PASS: HTTP redirects to HTTPS and ACME remains reachable' "$output" 'successful smoke omitted HTTP gate'
assert_contains 'PASS: TLS certificate' "$output" 'successful smoke omitted certificate gate'
assert_contains 'PASS: security headers' "$output" 'successful smoke omitted header gate'
assert_contains 'PASS: API health' "$output" 'successful smoke omitted health gate'
assert_contains 'PASS: API docs are unavailable' "$output" 'successful smoke omitted docs gate'
assert_contains 'PASS: private ports are not publicly reachable' "$output" 'successful smoke omitted port gate'
assert_contains 'PASS: production logs contain no sensitive values' "$output" 'successful smoke omitted log gate'
assert_contains 'PASS: participant login and heartbeat' "$output" 'successful smoke omitted participant flow'
assert_contains 'PASS: administrator login and dashboard' "$output" 'successful smoke omitted admin flow'
assert_not_contains 'AdminSecret!123' "$output" 'successful smoke printed the admin password'
assert_not_contains 'ParticipantSecret!123' "$output" 'successful smoke printed the participant password'
assert_not_contains 'participant-csrf' "$output" 'successful smoke printed the participant CSRF token'
assert_not_contains 'admin-csrf' "$output" 'successful smoke printed the admin CSRF token'

logout_calls="$(grep -c '/api/auth/logout' "$CURL_CALLS" || true)"
[[ "$logout_calls" == '2' ]] || fail 'successful smoke did not logout both authenticated sessions'
assert_not_contains '/auth/register' "$(<"$CURL_CALLS")" 'successful smoke called participant registration'
for protected_path in /auth/login /auth/admin/login /auth/heartbeat /auth/logout; do
  protected_calls="$(grep "$protected_path" "$CURL_CALLS" || true)"
  assert_contains 'Origin: https://gameficacao.semcomp.com.br' "$protected_calls" \
    "smoke omitted the trusted browser origin for $protected_path"
done
assert_contains 'logs' "$(<"$DOCKER_CALLS")" 'successful smoke did not scan production logs'
for port in 22 3000 3001 5432; do
  assert_contains " $port" "$(<"$NC_CALLS")" "successful smoke did not check private port $port"
done
assert_contains 's_client' "$(<"$OPENSSL_CALLS")" 'successful smoke did not inspect the TLS certificate'
assert_contains 'x509' "$(<"$OPENSSL_CALLS")" 'successful smoke did not validate the X509 certificate'
assert_contains 'checkhost gameficacao.semcomp.com.br' "$(<"$OPENSSL_CALLS")" 'successful smoke did not validate the certificate hostname'

printf 'smoke gates, credentials, cleanup and secret handling: ok\n'
