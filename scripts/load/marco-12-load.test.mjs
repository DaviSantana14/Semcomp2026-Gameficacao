import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runLoad } from "./marco-9-load.mjs";

function jsonResponse(status, body, cookie) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("set-cookie", `${cookie}; Path=/`);
  return new Response(JSON.stringify(body), { status, headers });
}

function emptyResponse(status) {
  return new Response(null, { status });
}

function bytesResponse(status, body, extraHeaders = {}) {
  return new Response(new TextEncoder().encode(body), {
    status,
    headers: extraHeaders,
  });
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

test("rehearses Marco 12 exports and QR artifacts without leaking payloads", async () => {
  const reportDirectory = await mkdtemp(join(os.tmpdir(), "marco-12-load-"));
  const claimCodes = Array.from(
    { length: 500 },
    (_, index) => `M12-CODE-${String(index + 1).padStart(3, "0")}`,
  );
  const calls = [];
  let abuseAttempts = 0;
  let activeQrDownloads = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      body,
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

    if (url.pathname === "/admin/actions/action-1/claim-codes/generate") {
      return jsonResponse(201, {
        action: { id: "action-1", name: "Credenciamento" },
        batch: { id: "batch-500" },
        codes: [...claimCodes],
        quantity: claimCodes.length,
      });
    }

    if (url.pathname === "/admin/participants/export.csv") {
      assert.equal(url.search, "?status=active");
      return bytesResponse(
        200,
        `nome;email;cpf\r\nAna;raw-csv@example.test;12345678909\r\n`,
        { "content-type": "text/csv; charset=utf-8" },
      );
    }

    if (url.pathname === "/admin/claim-code-batches/batch-500/qr.pdf") {
      activeQrDownloads += 1;
      if (activeQrDownloads === 1) {
        return new Promise((resolve) => {
          setTimeout(() => {
            activeQrDownloads -= 1;
            resolve(bytesResponse(200, `raw-pdf-${claimCodes[0]}`));
          }, 5);
        });
      }

      activeQrDownloads -= 1;
      return bytesResponse(429, JSON.stringify({ message: "busy" }), {
        "content-type": "application/json",
        "retry-after": "30",
      });
    }

    if (url.pathname === "/admin/claim-code-batches/batch-500/qr-images.zip") {
      return bytesResponse(200, `raw-zip-${claimCodes[0]}`, {
        "content-type": "application/zip",
      });
    }

    if (url.pathname === "/admin/security-metrics/overview") {
      return jsonResponse(200, {
        status: "NORMAL",
        lastFlushedMinute: "2026-08-23T15:00:00.000Z",
        periods: {
          fiveMinutes: { unauthorized: 1, forbidden: 2, rateLimited: 3 },
          oneHour: { unauthorized: 4, forbidden: 5, rateLimited: 6 },
          twentyFourHours: {
            unauthorized: 7,
            forbidden: 8,
            rateLimited: 9,
          },
        },
        thresholds: {
          unauthorized: 20,
          forbidden: 10,
          rateLimited: 5,
          windowMinutes: 5,
        },
        email: "raw-security@example.test",
        code: claimCodes[0],
      });
    }

    if (url.pathname === "/admin/presence/overview") {
      return jsonResponse(200, {
        status: "LIVE",
        onlineNow: 150,
        lastCollectedAt: new Date().toISOString(),
        timezone: "America/Sao_Paulo",
      });
    }

    if (url.pathname === "/admin/presence/history") {
      return jsonResponse(200, {
        items: [{ operationalDate: todayInSaoPaulo() }],
      });
    }

    if (
      url.pathname === "/admin/dashboard" ||
      url.pathname === "/admin/participants" ||
      url.pathname === "/admin/actions" ||
      url.pathname === "/admin/rewards"
    ) {
      return jsonResponse(200, {});
    }

    return jsonResponse(200, {});
  };

  try {
    const reportPath = join(reportDirectory, "report.json");
    const result = await runLoad({
      adminCredentials: {
        cpf: "52998224725",
        email: "marco12-admin@example.test",
        password: "admin-password",
      },
      baseUrl: "http://load.test",
      claimCodeActionId: "action-1",
      claimCodeQuantity: 500,
      concurrency: 50,
      enforceHostLimits: false,
      heartbeatIntervalMs: 10,
      heartbeatWindowMs: 200,
      marco12: true,
      origin: "http://load.test",
      participants: 150,
      presencePollIntervalMs: 1,
      presencePollTimeoutMs: 20,
      readWindowMs: 0,
      reduced: true,
      redemptionCount: 0,
      redemptions: 0,
      reportPath,
      runId: "marco-12-test",
      skipAdmin: false,
      timeoutMs: 100,
    });
    const reportText = await readFile(reportPath, "utf8");
    const report = JSON.parse(reportText);

    assert.equal(
      result.exitCode,
      0,
      `${report.issues.join("; ")} artifacts=${JSON.stringify(report.artifacts)}`,
    );
    assert.equal(report.thresholds.expectedParticipants, 150);
    assert.equal(report.thresholds.validParticipant429, 0);
    assert.equal(report.artifacts.claimCodeCount, 500);
    assert.equal(report.artifacts.csvDownloaded, true);
    assert.equal(report.artifacts.pdfDownloaded, true);
    assert.equal(report.artifacts.zipDownloaded, true);
    assert.equal(report.artifacts.qrConcurrencyRejected, true);
    assert.equal(report.artifacts.qrRetryAfterSeconds, 30);
    assert.ok(report.artifacts.csvBytes > 0);
    assert.ok(report.artifacts.pdfBytes > 0);
    assert.ok(report.artifacts.zipBytes > 0);
    assert.equal(report.securityMetrics.containsPii, false);
    assert.deepEqual(report.securityMetrics.periods.fiveMinutes, {
      unauthorized: 1,
      forbidden: 2,
      rateLimited: 3,
    });

    const generationCall = calls.find(
      ({ method, path }) =>
        method === "POST" &&
        path === "/admin/actions/action-1/claim-codes/generate",
    );
    assert.deepEqual(generationCall.body, {
      quantity: 500,
      reason: "Marco 12 load rehearsal",
    });

    assert.ok(
      calls.some(
        ({ method, path }) =>
          method === "GET" &&
          path === "/admin/participants/export.csv?status=active",
      ),
    );
    assert.equal(
      calls.filter(
        ({ method, path }) =>
          method === "GET" &&
          path === "/admin/claim-code-batches/batch-500/qr.pdf",
      ).length,
      2,
    );
    assert.equal(calls.filter(({ path }) => path === "/users/me").length, 75);

    assert.ok(
      claimCodes.every((value) => !reportText.includes(value)),
      "a generated Claim Code leaked into the report",
    );
    for (const value of [
      "raw-csv@example.test",
      "12345678909",
      "raw-security@example.test",
      "raw-pdf-",
      "raw-zip-",
    ]) {
      assert.equal(reportText.includes(value), false, `leaked ${value}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(reportDirectory, { recursive: true, force: true });
  }
});
