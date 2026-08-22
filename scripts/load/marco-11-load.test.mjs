import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectSensitiveValues,
  DEFAULT_PARTICIPANT_COUNT,
  runLoad,
} from "./marco-9-load.mjs";

function jsonResponse(status, body, cookie) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("set-cookie", `${cookie}; Path=/`);
  return new Response(JSON.stringify(body), { status, headers });
}

function emptyResponse(status) {
  return new Response(null, { status });
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

test("rehearses 150 email/password sessions with daily presence", async () => {
  assert.equal(DEFAULT_PARTICIPANT_COUNT, 150);
  const reportDirectory = await mkdtemp(join(os.tmpdir(), "marco-11-load-"));
  const calls = [];
  let abuseAttempts = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      body,
      csrfToken: new Headers(init.headers).get("X-CSRF-Token"),
      method: init.method ?? "GET",
      path: `${url.pathname}${url.search}`,
    });

    if (url.pathname === "/auth/register") {
      return jsonResponse(
        201,
        { csrfToken: `register-csrf-${body.email}`, user: {} },
        `access_token=register-${body.email}`,
      );
    }

    if (url.pathname === "/auth/login") {
      if (body.email.includes("abuse")) {
        if (!body.password) return jsonResponse(400, { message: "invalid" });
        abuseAttempts += 1;
        return jsonResponse(abuseAttempts >= 2 ? 429 : 401, {
          message: "invalid",
        });
      }

      return jsonResponse(
        200,
        { csrfToken: `csrf-${body.email}`, user: {} },
        `access_token=session-${body.email}`,
      );
    }

    if (url.pathname === "/auth/admin/login") {
      if (!body.password) return jsonResponse(400, { message: "invalid" });
      if (body.password.startsWith("invalid-")) {
        return jsonResponse(401, { message: "invalid" });
      }
      return jsonResponse(
        200,
        { csrfToken: "admin-csrf", user: {} },
        "access_token=admin-session",
      );
    }

    if (url.pathname === "/auth/logout") return emptyResponse(204);
    if (url.pathname === "/auth/heartbeat") return emptyResponse(204);
    if (url.pathname === "/users/me" || url.pathname === "/ranking") {
      return jsonResponse(200, {});
    }

    if (url.pathname === "/admin/presence/overview") {
      return jsonResponse(200, {
        status: "LIVE",
        onlineNow: 150,
        lastCollectedAt: new Date().toISOString(),
        timezone: "America/Sao_Paulo",
        heartbeatIntervalSeconds: 60,
        onlineWindowSeconds: 120,
        registeredParticipants: 150,
        uniqueParticipantsEverLogged: 150,
        monitoredDays: 1,
        today: {},
        overallPeak: {},
      });
    }

    if (url.pathname === "/admin/presence/history") {
      return jsonResponse(200, {
        period: { from: "today", to: "tomorrow" },
        timezone: "America/Sao_Paulo",
        items: [{ operationalDate: todayInSaoPaulo() }],
      });
    }

    return jsonResponse(200, {});
  };

  try {
    const reportPath = join(reportDirectory, "report.json");
    const result = await runLoad({
      baseUrl: "http://load.test",
      origin: "http://load.test",
      participants: 150,
      redemptions: 0,
      readWindowMs: 0,
      concurrency: 20,
      timeoutMs: 100,
      runId: "marco-11-test",
      reportPath,
      skipAdmin: false,
      adminCredentials: {
        cpf: "52998224725",
        email: "marco11-admin@example.test",
        password: "admin-password",
      },
      hostMetricsPath: undefined,
      enforceHostLimits: false,
      reduced: true,
      heartbeatIntervalMs: 200,
      heartbeatWindowMs: 1_000,
      presencePollIntervalMs: 1,
      presencePollTimeoutMs: 20,
    });
    const reportText = await readFile(reportPath, "utf8");
    const report = JSON.parse(reportText);

    assert.equal(
      result.exitCode,
      0,
      `${report.issues.join("; ")} heartbeat count=${report.operations.heartbeat?.count}`,
    );
    assert.equal(report.thresholds.expectedOnlineParticipants, 150);
    assert.equal(report.thresholds.observedOnlineParticipants, 150);
    assert.equal(report.thresholds.dailyRowsForToday, 1);
    assert.equal(report.operations.heartbeat.errors, 0);
    assert.equal(report.operations.presenceOverview.errors, 0);
    assert.equal(report.operations.presenceHistory.errors, 0);

    const registrationCalls = calls.filter(
      ({ method, path }) => method === "POST" && path === "/auth/register",
    );
    assert.equal(registrationCalls.length, 150);
    assert.ok(
      registrationCalls.every(
        ({ body }) =>
          typeof body.password === "string" &&
          Object.keys(body).sort().join(",") === "cpf,email,name,password",
      ),
    );

    const participantLoginCalls = calls.filter(
      ({ method, path, body }) =>
        method === "POST" &&
        path === "/auth/login" &&
        !body.email.includes("abuse"),
    );
    assert.equal(participantLoginCalls.length, 150);
    assert.ok(
      participantLoginCalls.every(
        ({ body }) =>
          typeof body.password === "string" &&
          Object.keys(body).sort().join(",") === "email,password",
      ),
    );

    const legacyLoginCalls = calls.filter(
      ({ method, path, body }) =>
        method === "POST" &&
        path === "/auth/login" &&
        body.email.includes("abuse") &&
        !body.password,
    );
    assert.equal(legacyLoginCalls.length, 1);

    const registrationLogoutCalls = calls.filter(
      ({ csrfToken, method, path }) =>
        method === "POST" &&
        path === "/auth/logout" &&
        csrfToken?.startsWith("register-csrf-"),
    );
    assert.equal(registrationLogoutCalls.length, 150);

    const heartbeatCalls = calls.filter(
      ({ method, path }) => method === "POST" && path === "/auth/heartbeat",
    );
    assert.ok(heartbeatCalls.length >= 150 * 3);

    assert.ok(
      calls.some(
        ({ method, path }) =>
          method === "GET" && path === "/admin/presence/overview",
      ),
    );
    assert.ok(
      calls.some(
        ({ method, path }) =>
          method === "GET" && path.startsWith("/admin/presence/history?"),
      ),
    );

    assert.ok(
      calls.every(
        ({ path }) =>
          !path.includes("/presence/samples") &&
          !path.includes("/presence/minutes") &&
          !path.includes("granularity"),
      ),
    );

    const sensitiveValues = [
      ...registrationCalls.flatMap(({ body }) => [
        body.cpf,
        body.email,
        body.password,
        `access_token=register-${body.email}`,
        `register-csrf-${body.email}`,
        `access_token=session-${body.email}`,
        `csrf-${body.email}`,
      ]),
      "52998224725",
      "marco11-admin@example.test",
      "admin-password",
      "access_token=admin-session",
      "admin-csrf",
      legacyLoginCalls[0].body.cpf,
      legacyLoginCalls[0].body.email,
      calls.find(
        ({ body, method, path }) =>
          method === "POST" &&
          path === "/auth/login" &&
          body.email.includes("abuse") &&
          typeof body.password === "string",
      ).body.password,
    ];
    assert.ok(sensitiveValues.every((value) => !reportText.includes(value)));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(reportDirectory, { recursive: true, force: true });
  }
});

test("includes transient credentials in the report sensitivity scan", () => {
  const participants = [
    {
      cpf: "12345678909",
      email: "participant@example.test",
      password: "M11-example-secret",
      registrationCookie: "access_token=registration",
      registrationCsrfToken: "registration-csrf",
      cookie: "access_token=session",
      csrfToken: "session-csrf",
    },
  ];
  const credentials = {
    cpf: "52998224725",
    email: "admin@example.test",
    password: "admin-secret",
  };

  const sensitiveValues = collectSensitiveValues(
    participants,
    credentials,
    [{ cookie: "access_token=session-2", csrfToken: "session-csrf-2" }],
    ["access_token=admin-session", "admin-csrf"],
  );

  for (const value of [
    "12345678909",
    "participant@example.test",
    "M11-example-secret",
    "access_token=registration",
    "registration-csrf",
    "access_token=session",
    "session-csrf",
    "52998224725",
    "admin@example.test",
    "admin-secret",
    "access_token=session-2",
    "session-csrf-2",
    "access_token=admin-session",
    "admin-csrf",
  ]) {
    assert.ok(sensitiveValues.includes(value), `missing ${value}`);
  }
});
