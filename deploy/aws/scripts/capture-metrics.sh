#!/usr/bin/env bash

set -euo pipefail
umask 077

output_path="${METRICS_OUTPUT:-artifacts/marco-9-host-metrics.log}"
interval_seconds="${METRICS_INTERVAL_SECONDS:-5}"
duration_seconds="${METRICS_DURATION_SECONDS:-60}"
compose_file="${COMPOSE_FILE:-}"
compose_env_file="${COMPOSE_ENV_FILE:-}"
status_log="${HTTP_STATUS_LOG:-}"
aws_instance_id="${AWS_INSTANCE_ID:-}"
aws_region="${AWS_REGION:-sa-east-1}"
aws_lookback_minutes="${AWS_METRICS_LOOKBACK_MINUTES:-5}"

fail() {
  printf 'metrics capture failed: %s\n' "$1" >&2
  exit 1
}

is_non_negative_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

is_positive_integer() {
  is_non_negative_integer "$1" && ((10#$1 > 0))
}

is_positive_integer "$interval_seconds" || fail 'METRICS_INTERVAL_SECONDS must be a positive integer'
is_non_negative_integer "$duration_seconds" || fail 'METRICS_DURATION_SECONDS must be a non-negative integer'
is_positive_integer "$aws_lookback_minutes" || fail 'AWS_METRICS_LOOKBACK_MINUTES must be a positive integer'
interval_value=$((10#$interval_seconds))
duration_value=$((10#$duration_seconds))

mkdir -p -- "$(dirname -- "$output_path")"
: > "$output_path"

compose_command=()
if [[ -n "$compose_file" ]]; then
  compose_command=(docker compose)
  if [[ -n "$compose_env_file" ]]; then
    compose_command+=(--env-file "$compose_env_file")
  fi
  compose_command+=(-f "$compose_file")
fi

read_cpu_snapshot() {
  local line
  local user nice system idle iowait irq softirq steal
  line="$(awk '/^cpu / { print; exit }' /proc/stat)"
  read -r _ user nice system idle iowait irq softirq steal _ <<< "$line"
  user="${user:-0}"
  nice="${nice:-0}"
  system="${system:-0}"
  idle="${idle:-0}"
  iowait="${iowait:-0}"
  irq="${irq:-0}"
  softirq="${softirq:-0}"
  steal="${steal:-0}"
  printf '%s %s\n' \
    "$((user + nice + system + idle + iowait + irq + softirq + steal))" \
    "$((idle + iowait))"
}

memory_percent() {
  awk '
    /^MemTotal:/ { total = $2 }
    /^MemAvailable:/ { available = $2 }
    END {
      if (total > 0) printf "%.2f", (1 - available / total) * 100
      else print "null"
    }
  ' /proc/meminfo
}

disk_percent() {
  local value
  value="$(df -P / | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf 'null\n'
  fi
}

postgres_connections() {
  if [[ "${#compose_command[@]}" -eq 0 ]] || ! command -v docker >/dev/null 2>&1; then
    printf 'null\n'
    return
  fi

  local value
  if value="$(
    "${compose_command[@]}" exec -T postgres sh -c \
      'psql -Atqc "SELECT count(*) FROM pg_stat_activity" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
      2>/dev/null
  )" && [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf 'null\n'
  fi
}

status_text=''
refresh_status_text() {
  if [[ -n "$status_log" && -f "$status_log" ]]; then
    status_text="$(< "$status_log")"
  elif [[ "${#compose_command[@]}" -gt 0 ]] && command -v docker >/dev/null 2>&1; then
    status_text="$(
      "${compose_command[@]}" logs --no-color --since "${METRICS_LOG_SINCE:-1m}" nginx api 2>/dev/null || true
    )"
  else
    status_text=''
  fi
}

count_status() {
  local code="$1"
  local matches
  matches="$(printf '%s\n' "$status_text" | grep -Eo "(^|[^0-9])${code}([^0-9]|$)" || true)"
  if [[ -n "$matches" ]]; then
    printf '%s\n' "$matches" | wc -l | tr -d ' '
  else
    printf '0\n'
  fi
}

aws_metric_value() {
  local metric_name="$1"
  if [[ -z "$aws_instance_id" ]] || ! command -v aws >/dev/null 2>&1; then
    printf 'null\n'
    return
  fi

  local end_time start_time raw value
  end_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  start_time="$(date -u -d "-${aws_lookback_minutes} minutes" +%Y-%m-%dT%H:%M:%SZ)"
  raw="$(
    aws cloudwatch get-metric-statistics \
      --region "$aws_region" \
      --namespace AWS/EC2 \
      --metric-name "$metric_name" \
      --dimensions "Name=InstanceId,Value=$aws_instance_id" \
      --statistics Average \
      --period 60 \
      --start-time "$start_time" \
      --end-time "$end_time" \
      --output json \
      --no-cli-pager 2>/dev/null || true
  )"
  value="$(printf '%s' "$raw" | node --input-type=module -e '
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const points = (data.Datapoints ?? [])
        .map((point) => point.Average)
        .filter((point) => typeof point === "number");
      process.stdout.write(points.length > 0 ? String(points.at(-1)) : "null");
    } catch {
      process.stdout.write("null");
    }
  ')"
  if [[ "$value" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; then
    printf '%s\n' "$value"
  else
    printf 'null\n'
  fi
}

previous_total=0
previous_idle=0
first_sample=1
started_at="$(date +%s)"
max_memory_percent=0
memory_limit_failed=0
cpu_limit_failed=0
consecutive_cpu_high=0

while true; do
  read -r current_total current_idle <<< "$(read_cpu_snapshot)"
  if [[ "$first_sample" -eq 1 ]]; then
    cpu_percent='0.00'
    first_sample=0
  else
    total_delta=$((current_total - previous_total))
    idle_delta=$((current_idle - previous_idle))
    if ((total_delta > 0 && idle_delta >= 0)); then
      cpu_percent="$(awk -v idle="$idle_delta" -v total="$total_delta" 'BEGIN { printf "%.2f", (1 - idle / total) * 100 }')"
    else
      cpu_percent='0.00'
    fi
  fi
  previous_total="$current_total"
  previous_idle="$current_idle"

  current_memory="$(memory_percent)"
  current_disk="$(disk_percent)"
  current_connections="$(postgres_connections)"
  refresh_status_text
  current_401="$(count_status 401)"
  current_403="$(count_status 403)"
  current_429="$(count_status 429)"
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  printf '{"type":"host","timestamp":"%s","cpu_percent":%s,"memory_percent":%s,"disk_percent":%s,"postgres_connections":%s,"http_401":%s,"http_403":%s,"http_429":%s}\n' \
    "$timestamp" "$cpu_percent" "$current_memory" "$current_disk" \
    "$current_connections" "$current_401" "$current_403" "$current_429" \
    >> "$output_path"

  if [[ "$current_memory" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    if awk -v current="$current_memory" -v maximum="$max_memory_percent" 'BEGIN { exit !(current > maximum) }'; then
      max_memory_percent="$current_memory"
    fi
    if awk -v current="$current_memory" 'BEGIN { exit !(current >= 75) }'; then
      memory_limit_failed=1
    fi
  fi
  if awk -v current="$cpu_percent" 'BEGIN { exit !(current > 80) }'; then
    consecutive_cpu_high=$((consecutive_cpu_high + 1))
  else
    consecutive_cpu_high=0
  fi
  if ((consecutive_cpu_high >= 2)); then
    cpu_limit_failed=1
  fi

  current_epoch="$(date +%s)"
  elapsed=$((current_epoch - started_at))
  if ((elapsed >= duration_value)); then
    break
  fi
  sleep "$interval_value"
done

aws_cpu_utilization="$(aws_metric_value CPUUtilization)"
aws_credit_balance="$(aws_metric_value CPUCreditBalance)"
aws_surplus_credits="$(aws_metric_value CPUSurplusCreditsCharged)"
aws_credit_usage="$(aws_metric_value CPUCreditUsage)"
printf '{"type":"aws","timestamp":"%s","instance_id_configured":%s,"CPUUtilization":%s,"CPUCreditBalance":%s,"CPUSurplusCreditsCharged":%s,"CPUCreditUsage":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$([[ -n "$aws_instance_id" ]] && printf true || printf false)" \
  "$aws_cpu_utilization" "$aws_credit_balance" "$aws_surplus_credits" "$aws_credit_usage" \
  >> "$output_path"

printf '{"type":"summary","max_memory_percent":%s,"memory_below_75_percent":%s,"cpu_not_sustained_above_80_percent":%s,"passed":%s}\n' \
  "$max_memory_percent" \
  "$([[ "$memory_limit_failed" -eq 0 ]] && printf true || printf false)" \
  "$([[ "$cpu_limit_failed" -eq 0 ]] && printf true || printf false)" \
  "$([[ "$memory_limit_failed" -eq 0 && "$cpu_limit_failed" -eq 0 ]] && printf true || printf false)" \
  >> "$output_path"

printf 'metrics captured: %s\n' "$output_path"
if [[ "$memory_limit_failed" -ne 0 || "$cpu_limit_failed" -ne 0 ]]; then
  exit 1
fi
