import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { generateCpf } from "./cpf.mjs";

const DEFAULT_READ_WINDOW_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 20;
export const DEFAULT_PARTICIPANT_COUNT = 150;
const DEFAULT_REDEMPTION_COUNT = 100;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const DEFAULT_HEARTBEAT_WINDOW_MS = 130_000;
const DEFAULT_PRESENCE_POLL_INTERVAL_MS = 5_000;
const DEFAULT_PRESENCE_POLL_TIMEOUT_MS = 60_000;
const MAX_CPF_INDEX = 899_999_998;
const OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";
const READ_OPERATION_NAMES = new Set([
  "home",
  "ranking",
  "adminRead",
  "presenceOverview",
  "presenceHistory",
]);
const MUTATION_OPERATION_NAMES = new Set([
  "register",
  "participantLogout",
  "heartbeat",
  "redemption",
]);
const SCENARIO_OPERATION_NAMES = new Set([
  "register",
  "participantLogout",
  "participantLogin",
  "legacyParticipantLogin",
  "heartbeat",
  "home",
  "ranking",
  "redemption",
  "adminRead",
  "presenceOverview",
  "presenceHistory",
]);

class OperationStats {
  constructor(name) {
    this.name = name;
    this.samples = [];
    this.errors = 0;
  }

  record(durationMs, successful) {
    this.samples.push(durationMs);
    if (!successful) this.errors += 1;
  }

  summary() {
    const sorted = [...this.samples].sort((first, second) => first - second);

    return {
      count: sorted.length,
      errors: this.errors,
      minMs: sorted.length > 0 ? roundMs(sorted[0]) : null,
      medianMs: sorted.length > 0 ? roundMs(percentile(sorted, 0.5)) : null,
      p95Ms: sorted.length > 0 ? roundMs(percentile(sorted, 0.95)) : null,
      maxMs: sorted.length > 0 ? roundMs(sorted[sorted.length - 1]) : null,
    };
  }
}

class LoadMetrics {
  constructor() {
    this.operations = new Map();
    this.statusCounts = new Map();
  }

  record(operationName, durationMs, successful, status) {
    let operation = this.operations.get(operationName);
    if (!operation) {
      operation = new OperationStats(operationName);
      this.operations.set(operationName, operation);
    }

    operation.record(durationMs, successful);
    if (Number.isInteger(status)) {
      this.statusCounts.set(status, (this.statusCounts.get(status) ?? 0) + 1);
    }
  }

  summaries() {
    return Object.fromEntries(
      [...this.operations.entries()].map(([name, operation]) => [
        name,
        operation.summary(),
      ]),
    );
  }

  statusSummary() {
    return Object.fromEntries(
      [401, 403, 429].map((status) => [
        String(status),
        this.statusCounts.get(status) ?? 0,
      ]),
    );
  }
}

function roundMs(value) {
  return Number(value.toFixed(2));
}

function percentile(sortedValues, percentileValue) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );
  return sortedValues[index];
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error("boolean configuration is invalid");
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("BASE_URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("BASE_URL must not contain credentials");
  }
  if (url.search || url.hash) {
    throw new Error("BASE_URL must not contain a query or fragment");
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path === "/" ? "" : path}`;
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("LOAD_ORIGIN must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("LOAD_ORIGIN must not contain credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LOAD_ORIGIN must identify the application origin");
  }
  return url.origin;
}

function sanitizeRunId(value) {
  const sanitized = String(value ?? "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return sanitized || String(Date.now());
}

function participantCpfOffset(runId, count) {
  let hash = 2_166_136_261;
  for (const character of String(runId)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;
  }

  const maxOffset = MAX_CPF_INDEX - count + 1;
  if (maxOffset < 0) throw new RangeError("CPF cohort is too large");
  return hash % (maxOffset + 1);
}

function getConfig() {
  const reduced = parseBoolean(process.env.LOAD_REDUCED, false);
  const participantFallback = reduced ? 5 : DEFAULT_PARTICIPANT_COUNT;
  const redemptionFallback = reduced ? 2 : DEFAULT_REDEMPTION_COUNT;
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL ?? "http://localhost");

  if (
    Object.hasOwn(process.env, "ADMIN_PASSWORD") ||
    Object.hasOwn(process.env, "LOAD_ADMIN_PASSWORD")
  ) {
    throw new Error(
      "administrative password must be supplied through protected input",
    );
  }

  return {
    baseUrl,
    origin: normalizeOrigin(process.env.LOAD_ORIGIN ?? new URL(baseUrl).origin),
    participants: parsePositiveInteger(
      process.env.LOAD_PARTICIPANTS,
      participantFallback,
      "LOAD_PARTICIPANTS",
    ),
    redemptions: parseNonNegativeInteger(
      process.env.LOAD_REDEMPTIONS,
      redemptionFallback,
      "LOAD_REDEMPTIONS",
    ),
    readWindowMs: parseNonNegativeInteger(
      process.env.LOAD_READ_WINDOW_MS,
      reduced ? 1_000 : DEFAULT_READ_WINDOW_MS,
      "LOAD_READ_WINDOW_MS",
    ),
    concurrency: parsePositiveInteger(
      process.env.LOAD_CONCURRENCY,
      DEFAULT_CONCURRENCY,
      "LOAD_CONCURRENCY",
    ),
    timeoutMs: parsePositiveInteger(
      process.env.LOAD_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      "LOAD_REQUEST_TIMEOUT_MS",
    ),
    heartbeatIntervalMs: parsePositiveInteger(
      process.env.LOAD_HEARTBEAT_INTERVAL_MS,
      DEFAULT_HEARTBEAT_INTERVAL_MS,
      "LOAD_HEARTBEAT_INTERVAL_MS",
    ),
    heartbeatWindowMs: parsePositiveInteger(
      process.env.LOAD_HEARTBEAT_WINDOW_MS,
      DEFAULT_HEARTBEAT_WINDOW_MS,
      "LOAD_HEARTBEAT_WINDOW_MS",
    ),
    presencePollIntervalMs: parsePositiveInteger(
      process.env.LOAD_PRESENCE_POLL_INTERVAL_MS,
      reduced ? 1_000 : DEFAULT_PRESENCE_POLL_INTERVAL_MS,
      "LOAD_PRESENCE_POLL_INTERVAL_MS",
    ),
    presencePollTimeoutMs: parsePositiveInteger(
      process.env.LOAD_PRESENCE_POLL_TIMEOUT_MS,
      DEFAULT_PRESENCE_POLL_TIMEOUT_MS,
      "LOAD_PRESENCE_POLL_TIMEOUT_MS",
    ),
    runId: sanitizeRunId(process.env.LOAD_RUN_ID ?? Date.now()),
    reportPath:
      process.env.LOAD_REPORT_PATH ?? "artifacts/marco-11-load-report.json",
    redeemCode: process.env.LOAD_REDEEM_CODE,
    adminCpf: process.env.LOAD_ADMIN_CPF,
    adminEmail: process.env.LOAD_ADMIN_EMAIL,
    skipAdmin: parseBoolean(process.env.LOAD_SKIP_ADMIN_SCENARIOS, false),
    hostMetricsPath: process.env.LOAD_HOST_METRICS_PATH,
    enforceHostLimits: parseBoolean(
      process.env.LOAD_ENFORCE_HOST_LIMITS,
      false,
    ),
    reduced,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, consume));
  return results;
}

async function runPaced(items, windowMs, worker) {
  const startedAt = performance.now();
  return Promise.all(
    items.map(async (item, index) => {
      const targetStart = (windowMs * index) / Math.max(1, items.length);
      const elapsed = performance.now() - startedAt;
      if (targetStart > elapsed) await sleep(targetStart - elapsed);
      return worker(item, index);
    }),
  );
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function extractAuthCookie(headers) {
  const cookie = getSetCookieHeaders(headers).find((value) =>
    /^access_token=/.test(value),
  );
  return cookie?.split(";", 1)[0] ?? null;
}

async function request(baseUrl, path, options = {}) {
  const startedAt = performance.now();
  const url = new URL(path.replace(/^\/+/, ""), `${baseUrl}/`);
  const headers = new Headers(options.headers);

  if (options.origin) headers.set("Origin", options.origin);
  if (options.session?.cookie) {
    headers.set("Cookie", options.session.cookie);
  }
  if (options.csrfToken) {
    headers.set("X-CSRF-Token", options.csrfToken);
  }
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const body = await response.text();

    return {
      body,
      cookie: extractAuthCookie(response.headers),
      durationMs: performance.now() - startedAt,
      headers: response.headers,
      status: response.status,
    };
  } catch {
    return {
      body: "",
      cookie: null,
      durationMs: performance.now() - startedAt,
      headers: new Headers(),
      status: null,
    };
  }
}

function consumeJson(response) {
  const body = response.body;
  response.body = "";
  if (!body) return null;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function statusIs(response, expectedStatus) {
  return response.status === expectedStatus;
}

function statusIsSuccessful(response) {
  return (
    response.status !== null && response.status >= 200 && response.status < 300
  );
}

function recordResponse(metrics, operationName, response, successful) {
  metrics.record(
    operationName,
    response.durationMs,
    successful,
    response.status,
  );
}

function buildParticipants(config) {
  const cpfOffset = participantCpfOffset(config.runId, config.participants + 1);
  return Array.from({ length: config.participants }, (_, index) => ({
    cpf: generateCpf(cpfOffset + index),
    email: `marco11-${config.runId}-${index}@rehearsal.invalid`,
    name: `Marco 11 Load ${index + 1}`,
    password: `M11-${randomBytes(24).toString("base64url")}`,
    registrationCookie: null,
    registrationCsrfToken: null,
    registrationLogoutSucceeded: false,
    cookie: null,
    csrfToken: null,
  }));
}

async function registerAndLoginParticipants(config, participants, metrics) {
  return runWithConcurrency(
    participants,
    config.concurrency,
    async (participant) => {
      const registration = await request(config.baseUrl, "/auth/register", {
        body: {
          cpf: participant.cpf,
          email: participant.email,
          name: participant.name,
          password: participant.password,
        },
        method: "POST",
        origin: config.origin,
        timeoutMs: config.timeoutMs,
      });
      recordResponse(
        metrics,
        "register",
        registration,
        statusIs(registration, 201),
      );
      const registrationBody = consumeJson(registration);
      participant.registrationCookie = registration.cookie;
      participant.registrationCsrfToken = registrationBody?.csrfToken ?? null;

      if (
        statusIs(registration, 201) &&
        typeof participant.registrationCookie === "string" &&
        typeof participant.registrationCsrfToken === "string"
      ) {
        const logout = await request(config.baseUrl, "/auth/logout", {
          csrfToken: participant.registrationCsrfToken,
          method: "POST",
          origin: config.origin,
          session: { cookie: participant.registrationCookie },
          timeoutMs: config.timeoutMs,
        });
        recordResponse(
          metrics,
          "participantLogout",
          logout,
          statusIs(logout, 204),
        );
        participant.registrationLogoutSucceeded = statusIs(logout, 204);
        consumeJson(logout);
      }

      const login = await request(config.baseUrl, "/auth/login", {
        body: { email: participant.email, password: participant.password },
        method: "POST",
        origin: config.origin,
        timeoutMs: config.timeoutMs,
      });
      const loginBody = consumeJson(login);
      const sessionIsUsable =
        statusIs(login, 200) &&
        typeof loginBody?.csrfToken === "string" &&
        loginBody.csrfToken.length > 0 &&
        typeof login.cookie === "string" &&
        login.cookie.length > 0;
      recordResponse(metrics, "participantLogin", login, sessionIsUsable);

      if (sessionIsUsable) {
        participant.cookie = login.cookie;
        participant.csrfToken = loginBody.csrfToken;
        return participant;
      }

      return null;
    },
  );
}

async function runParticipantReads(config, sessions, metrics) {
  const results = await runPaced(
    sessions,
    config.readWindowMs,
    async (participant, index) => {
      const operationName = index % 2 === 0 ? "home" : "ranking";
      const path =
        operationName === "home" ? "/users/me" : "/ranking?limit=10&period=all";
      const response = await request(config.baseUrl, path, {
        method: "GET",
        origin: config.origin,
        session: participant,
        timeoutMs: config.timeoutMs,
      });
      recordResponse(metrics, operationName, response, statusIs(response, 200));
      consumeJson(response);
      return response.status;
    },
  );

  return {
    count: results.length,
    rateLimited: results.filter((status) => status === 429).length,
  };
}

async function runParticipantHeartbeats(config, sessions, metrics) {
  await Promise.all(
    sessions.map(async (participant) => {
      let inFlight;

      const beat = () => {
        if (inFlight) return inFlight;

        inFlight = (async () => {
          const response = await request(config.baseUrl, "/auth/heartbeat", {
            csrfToken: participant.csrfToken,
            method: "POST",
            origin: config.origin,
            session: participant,
            timeoutMs: config.timeoutMs,
          });
          recordResponse(
            metrics,
            "heartbeat",
            response,
            statusIs(response, 204),
          );
          consumeJson(response);
        })().finally(() => {
          inFlight = undefined;
        });

        return inFlight;
      };

      await beat();
      const timer = setInterval(() => {
        void beat();
      }, config.heartbeatIntervalMs);

      try {
        await sleep(config.heartbeatWindowMs);
      } finally {
        clearInterval(timer);
        if (inFlight) await inFlight;
      }
    }),
  );
}

async function runRedemptions(config, sessions, metrics) {
  if (config.redemptions === 0) {
    return { count: 0, rateLimited: 0, sensitiveValues: [] };
  }
  if (!config.redeemCode) {
    return { count: 0, rateLimited: 0, missingCode: true, sensitiveValues: [] };
  }

  const targets = sessions.slice(0, config.redemptions);
  const results = await runWithConcurrency(
    targets,
    config.concurrency,
    async (participant) => {
      const response = await request(config.baseUrl, "/actions/redeem-code", {
        body: { code: config.redeemCode },
        csrfToken: participant.csrfToken,
        method: "POST",
        origin: config.origin,
        session: participant,
        timeoutMs: config.timeoutMs,
      });
      recordResponse(
        metrics,
        "redemption",
        response,
        statusIsSuccessful(response),
      );
      consumeJson(response);
      return response.status;
    },
  );

  return {
    count: results.length,
    rateLimited: results.filter((status) => status === 429).length,
    missingCode: false,
    sensitiveValues: [config.redeemCode],
  };
}

async function runAbuseScenario(config, metrics) {
  const cpfOffset = participantCpfOffset(config.runId, config.participants + 1);
  const abuseCpf = generateCpf(cpfOffset + config.participants);
  const abuseEmail = `marco11-abuse-${config.runId}@rehearsal.invalid`;
  let throttled = false;

  const legacyLogin = await request(config.baseUrl, "/auth/login", {
    body: { cpf: abuseCpf, email: abuseEmail },
    method: "POST",
    origin: config.origin,
    timeoutMs: config.timeoutMs,
  });
  const legacyRejected = [400, 401, 429].includes(legacyLogin.status);
  recordResponse(
    metrics,
    "legacyParticipantLogin",
    legacyLogin,
    legacyRejected,
  );
  consumeJson(legacyLogin);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request(config.baseUrl, "/auth/login", {
      body: { email: abuseEmail, password: `invalid-${config.runId}` },
      method: "POST",
      origin: config.origin,
      timeoutMs: config.timeoutMs,
    });
    const expected = response.status === 401 || response.status === 429;
    recordResponse(metrics, "abuseLogin", response, expected);
    consumeJson(response);
    if (response.status === 429) {
      throttled = true;
      break;
    }
  }

  return {
    legacyRejected,
    throttled,
    sensitiveValues: [abuseCpf, abuseEmail, `invalid-${config.runId}`],
  };
}

async function readNonTtyLines() {
  const input = await readFile(0, "utf8");
  return input.split(/\r?\n/);
}

async function readHiddenLine(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    const lines = await readNonTtyLines();
    return lines[0] ?? "";
  }

  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve) => {
    let value = "";
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stderr.write("\n");
      resolve(value);
    };

    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        } else if (character === "\u0003") {
          value = "";
          finish();
          return;
        } else if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

async function readAdminCredentials(config) {
  if (config.skipAdmin) return null;

  if (config.adminCredentials) {
    const { cpf, email, password } = config.adminCredentials;
    if (!cpf || !email || !password) {
      throw new Error(
        "protected administrative credential input is incomplete",
      );
    }
    return { cpf, email, password };
  }

  if (!process.stdin.isTTY) {
    const lines = await readNonTtyLines();
    let lineIndex = 0;
    const cpf = config.adminCpf ?? lines[lineIndex++];
    const email = config.adminEmail ?? lines[lineIndex++];
    const password = lines[lineIndex] ?? "";

    if (!cpf || !email || !password) {
      throw new Error(
        "protected administrative credential input is incomplete",
      );
    }

    return { cpf, email, password };
  }

  const input = process.stdin;
  const output = process.stderr;
  const readline = createInterface({ input, output });
  const cpf = config.adminCpf ?? (await readline.question("Admin CPF: "));
  const email = config.adminEmail ?? (await readline.question("Admin email: "));
  readline.close();
  const password = await readHiddenLine("Admin password: ");

  if (!cpf || !email || !password) {
    throw new Error("protected administrative credential input is incomplete");
  }

  return { cpf, email, password };
}

function formatOperationalDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addOperationalDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function pollPresence(config, adminSession, metrics) {
  const today = formatOperationalDate(new Date());
  const tomorrow = addOperationalDays(today, 1);
  const deadline = performance.now() + config.presencePollTimeoutMs;
  let attempts = 0;
  let latestOverview = null;
  let dailyRowsForToday = 0;

  while (true) {
    attempts += 1;
    const overview = await request(config.baseUrl, "/admin/presence/overview", {
      method: "GET",
      origin: config.origin,
      session: adminSession,
      timeoutMs: config.timeoutMs,
    });
    recordResponse(
      metrics,
      "presenceOverview",
      overview,
      statusIs(overview, 200),
    );
    latestOverview = consumeJson(overview);

    const history = await request(
      config.baseUrl,
      `/admin/presence/history?from=${today}&to=${tomorrow}`,
      {
        method: "GET",
        origin: config.origin,
        session: adminSession,
        timeoutMs: config.timeoutMs,
      },
    );
    recordResponse(metrics, "presenceHistory", history, statusIs(history, 200));
    const historyBody = consumeJson(history);
    dailyRowsForToday = Array.isArray(historyBody?.items)
      ? historyBody.items.filter((item) => item?.operationalDate === today)
          .length
      : 0;

    const fresh =
      statusIs(overview, 200) &&
      latestOverview?.status === "LIVE" &&
      latestOverview?.onlineNow === config.participants &&
      statusIs(history, 200) &&
      dailyRowsForToday === 1;
    if (fresh || performance.now() >= deadline) {
      return {
        attempts,
        dailyRowsForToday,
        fresh,
        lastCollectedAt: latestOverview?.lastCollectedAt ?? null,
        observedOnlineParticipants: latestOverview?.onlineNow ?? null,
        status: latestOverview?.status ?? null,
      };
    }

    await sleep(config.presencePollIntervalMs);
  }
}

async function runAdminScenario(config, credentials, metrics) {
  if (!credentials) return { skipped: true, valid: false, presence: null };

  const missingPassword = await request(config.baseUrl, "/auth/admin/login", {
    body: { cpf: credentials.cpf, email: credentials.email },
    method: "POST",
    origin: config.origin,
    timeoutMs: config.timeoutMs,
  });
  recordResponse(
    metrics,
    "adminLoginMissingPassword",
    missingPassword,
    statusIs(missingPassword, 400),
  );
  consumeJson(missingPassword);

  const incorrectPassword = await request(config.baseUrl, "/auth/admin/login", {
    body: {
      cpf: credentials.cpf,
      email: credentials.email,
      password: `invalid-${config.runId}`,
    },
    method: "POST",
    origin: config.origin,
    timeoutMs: config.timeoutMs,
  });
  recordResponse(
    metrics,
    "adminLoginIncorrectPassword",
    incorrectPassword,
    statusIs(incorrectPassword, 401),
  );
  consumeJson(incorrectPassword);

  const validLogin = await request(config.baseUrl, "/auth/admin/login", {
    body: {
      cpf: credentials.cpf,
      email: credentials.email,
      password: credentials.password,
    },
    method: "POST",
    origin: config.origin,
    timeoutMs: config.timeoutMs,
  });
  const loginBody = consumeJson(validLogin);
  const adminSession = {
    cookie: validLogin.cookie,
    csrfToken: loginBody?.csrfToken ?? null,
  };
  const valid =
    statusIs(validLogin, 200) &&
    typeof adminSession.cookie === "string" &&
    typeof adminSession.csrfToken === "string";
  recordResponse(metrics, "adminLoginValid", validLogin, valid);

  if (!valid) {
    return {
      skipped: false,
      valid: false,
      presence: null,
      sensitiveValues: [],
    };
  }

  const adminReadPaths = [
    "/admin/dashboard",
    "/admin/participants?limit=10&page=1",
    "/admin/actions?limit=10&page=1",
    "/admin/rewards?limit=10&page=1",
  ];
  await Promise.all(
    adminReadPaths.map(async (path) => {
      const response = await request(config.baseUrl, path, {
        method: "GET",
        origin: config.origin,
        session: adminSession,
        timeoutMs: config.timeoutMs,
      });
      recordResponse(metrics, "adminRead", response, statusIs(response, 200));
      consumeJson(response);
    }),
  );

  const presence = await pollPresence(config, adminSession, metrics);

  const logout = await request(config.baseUrl, "/auth/logout", {
    csrfToken: adminSession.csrfToken,
    method: "POST",
    origin: config.origin,
    session: adminSession,
    timeoutMs: config.timeoutMs,
  });
  recordResponse(metrics, "adminLogout", logout, statusIs(logout, 204));
  consumeJson(logout);

  return {
    skipped: false,
    valid: true,
    presence,
    sensitiveValues: [adminSession.cookie, adminSession.csrfToken],
  };
}

async function readHostMetrics(path) {
  if (!path) return { checked: false };

  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return { checked: false, error: "metrics file unavailable" };
  }

  const samples = content
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(
      (sample) =>
        sample &&
        typeof sample.cpu_percent === "number" &&
        typeof sample.memory_percent === "number",
    );

  const maximumMemory = samples.reduce(
    (maximum, sample) => Math.max(maximum, sample.memory_percent),
    0,
  );
  let sustainedCpu = false;
  let consecutiveCpuSamples = 0;
  for (const sample of samples) {
    consecutiveCpuSamples =
      sample.cpu_percent > 80 ? consecutiveCpuSamples + 1 : 0;
    if (consecutiveCpuSamples >= 2) sustainedCpu = true;
  }

  return {
    checked: true,
    sampleCount: samples.length,
    maxMemoryPercent: roundMs(maximumMemory),
    sustainedCpuAbove80Percent: sustainedCpu,
    passed: samples.length > 0 && maximumMemory < 75 && !sustainedCpu,
  };
}

function calculateThresholds(
  metrics,
  sessions,
  config,
  workload,
  adminResult,
  hostMetrics,
  issues,
) {
  const summaries = metrics.summaries();
  const presence = adminResult.presence ?? {
    attempts: 0,
    dailyRowsForToday: null,
    fresh: false,
    observedOnlineParticipants: null,
    status: null,
  };
  const scenarioSummaries = [...SCENARIO_OPERATION_NAMES]
    .map((name) => summaries[name])
    .filter((summary) => summary && summary.count > 0);
  const scenarioCount = scenarioSummaries.reduce(
    (total, summary) => total + summary.count,
    0,
  );
  const scenarioErrors = scenarioSummaries.reduce(
    (total, summary) => total + summary.errors,
    0,
  );
  const errorRatePercent =
    scenarioCount === 0 ? 100 : (scenarioErrors / scenarioCount) * 100;

  const readP95Values = [...READ_OPERATION_NAMES]
    .map((name) => summaries[name]?.p95Ms)
    .filter((value) => typeof value === "number");
  const mutationP95Values = [...MUTATION_OPERATION_NAMES]
    .map((name) => summaries[name]?.p95Ms)
    .filter((value) => typeof value === "number");
  const readP95Ms =
    readP95Values.length > 0 ? Math.max(...readP95Values) : null;
  const mutationP95Ms =
    mutationP95Values.length > 0 ? Math.max(...mutationP95Values) : null;
  const validParticipant429 = workload.reads.rateLimited;
  const minimumHeartbeats = sessions.length * 3;
  const registrationLogoutCount = sessions.filter(
    (participant) => participant.registrationLogoutSucceeded,
  ).length;

  if (sessions.length !== config.participants) {
    issues.push("not all participants authenticated");
  }
  if (registrationLogoutCount !== config.participants) {
    issues.push("registration session logout cohort is incomplete");
  }
  if (workload.reads.count !== config.participants) {
    issues.push("participant read cohort is incomplete");
  }
  if (workload.reads.rateLimited > 0) {
    issues.push("valid participant reads were rate limited");
  }
  if (workload.redemptions.missingCode) {
    issues.push("LOAD_REDEEM_CODE is required for the redemption scenario");
  }
  if (workload.redemptions.count !== config.redemptions) {
    issues.push("redemption cohort is incomplete");
  }
  if ((summaries.heartbeat?.errors ?? 0) > 0) {
    issues.push("participant heartbeat failed");
  }
  if ((summaries.heartbeat?.count ?? 0) < minimumHeartbeats) {
    issues.push("heartbeat window did not execute two intervals");
  }
  if (!workload.abuse.throttled) {
    issues.push("abuse scenario did not receive HTTP 429");
  }
  if (!workload.abuse.legacyRejected) {
    issues.push("legacy participant login was not rejected");
  }
  if (!adminResult.skipped && !adminResult.valid) {
    issues.push("administrative valid login did not succeed");
  }
  if (adminResult.skipped) {
    issues.push("daily presence verification was skipped");
  }
  if (adminResult.valid && !presence.fresh) {
    issues.push("daily presence did not reach the expected live state");
  }
  if (errorRatePercent >= 1) {
    issues.push("scenario error rate exceeded one percent");
  }
  if (readP95Ms === null || readP95Ms >= 800) {
    issues.push("read p95 exceeded 800 milliseconds");
  }
  if (mutationP95Ms === null || mutationP95Ms >= 1_000) {
    issues.push("mutation p95 exceeded one second");
  }
  if (!hostMetrics.checked && config.enforceHostLimits) {
    issues.push("host metrics were not available");
  }
  if (hostMetrics.checked && !hostMetrics.passed) {
    issues.push("host resource limits were exceeded");
  }

  return {
    errorRatePercent: roundMs(errorRatePercent),
    maxErrorRatePercent: 1,
    readP95Ms,
    maxReadP95Ms: 800,
    mutationP95Ms,
    maxMutationP95Ms: 1_000,
    authenticatedParticipants: sessions.length,
    requestedParticipants: config.participants,
    validParticipant429,
    abuseReceived429: workload.abuse.throttled,
    legacyParticipantLoginRejected: workload.abuse.legacyRejected,
    adminValidLogin: adminResult.skipped ? null : adminResult.valid,
    expectedOnlineParticipants: config.participants,
    observedOnlineParticipants: presence.observedOnlineParticipants,
    dailyRowsForToday: presence.dailyRowsForToday,
    presenceStatus: presence.status,
    presencePollAttempts: presence.attempts,
    presenceLastCollectedAt: presence.lastCollectedAt ?? null,
    hostLimits: hostMetrics,
    passed: issues.length === 0,
  };
}

function assertReportContainsNoSensitiveValues(reportText, sensitiveValues) {
  for (const value of sensitiveValues) {
    if (value && reportText.includes(value)) {
      throw new Error("report contains sensitive load-test material");
    }
  }
}

function discardSessionMaterial(participants, credentials) {
  for (const participant of participants) {
    participant.cpf = "";
    participant.email = "";
    participant.name = "";
    participant.password = "";
    participant.registrationCookie = null;
    participant.registrationCsrfToken = null;
    participant.cookie = null;
    participant.csrfToken = null;
  }
  if (credentials) {
    credentials.cpf = "";
    credentials.email = "";
    credentials.password = "";
  }
}

export function collectSensitiveValues(
  participants,
  credentials,
  sessions = [],
  adminSensitiveValues = [],
) {
  return [
    ...participants.flatMap((participant) => [
      participant.cpf,
      participant.email,
      participant.password,
      participant.registrationCookie,
      participant.registrationCsrfToken,
      participant.cookie,
      participant.csrfToken,
    ]),
    credentials?.cpf,
    credentials?.email,
    credentials?.password,
    ...sessions.flatMap((session) => [session.cookie, session.csrfToken]),
    ...adminSensitiveValues,
  ].filter(Boolean);
}

async function writeReport(config, report, sensitiveValues) {
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  assertReportContainsNoSensitiveValues(reportText, sensitiveValues);
  await mkdir(dirname(config.reportPath), { recursive: true });
  await writeFile(config.reportPath, reportText, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function runLoad(config = getConfig()) {
  const metrics = new LoadMetrics();
  const issues = [];
  const participants = buildParticipants(config);
  const credentials = await readAdminCredentials(config).catch(() => null);

  const sessions = (
    await registerAndLoginParticipants(config, participants, metrics)
  ).filter(Boolean);
  const reads = await runParticipantReads(config, sessions, metrics);
  await runParticipantHeartbeats(config, sessions, metrics);
  const redemptions = await runRedemptions(config, sessions, metrics);
  const abuse = await runAbuseScenario(config, metrics);
  const adminResult = credentials
    ? await runAdminScenario(config, credentials, metrics)
    : { skipped: config.skipAdmin, valid: false, presence: null };
  const sensitiveValues = collectSensitiveValues(
    participants,
    credentials,
    sessions,
    [
      ...(abuse.sensitiveValues ?? []),
      ...(redemptions.sensitiveValues ?? []),
      ...(adminResult.sensitiveValues ?? []),
    ],
  );
  const hostMetrics = await readHostMetrics(config.hostMetricsPath);

  if (!config.skipAdmin && !credentials) {
    issues.push("protected administrative credential input was unavailable");
  }
  const workload = { reads, redemptions, abuse };
  const thresholds = calculateThresholds(
    metrics,
    sessions,
    config,
    workload,
    adminResult,
    hostMetrics,
    issues,
  );
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    targetOrigin: config.baseUrl,
    mode: config.reduced ? "reduced" : "full",
    requestedParticipants: config.participants,
    requestedRedemptions: config.redemptions,
    operations: metrics.summaries(),
    httpStatusCounts: metrics.statusSummary(),
    thresholds,
    adminScenariosSkipped: config.skipAdmin,
    issues,
  };

  discardSessionMaterial(participants, credentials);
  await writeReport(config, report, sensitiveValues);
  return { report, exitCode: issues.length === 0 ? 0 : 1 };
}

async function main() {
  try {
    const result = await runLoad();
    console.log(
      `load report written: ${process.env.LOAD_REPORT_PATH ?? "artifacts/marco-11-load-report.json"}`,
    );
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } catch {
    console.error("load test failed before a report could be produced");
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
