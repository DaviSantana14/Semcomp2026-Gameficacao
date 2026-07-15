import { describe, expect, it, vi } from "vitest";
import {
  createIdempotencyLifecycle,
  invalidateParticipantOperationQueries,
  validateAdjustment,
} from "./participant-operations";

describe("participant operation validation", () => {
  it("accepts integer deltas in the same direction and predicts balances", () => {
    expect(
      validateAdjustment(
        { pointsDelta: "-10", xpDelta: "-2", reason: "Correcao operacional" },
        { points: 30, xp: 8 },
      ),
    ).toEqual({
      valid: true,
      values: { pointsDelta: -10, xpDelta: -2, reason: "Correcao operacional" },
      predicted: { points: 20, xp: 6 },
      errors: {},
    });
  });

  it.each([
    [
      { pointsDelta: "1.5", xpDelta: "0", reason: "Correcao operacional" },
      "pointsDelta",
    ],
    [
      { pointsDelta: "0", xpDelta: "0", reason: "Correcao operacional" },
      "deltas",
    ],
    [
      { pointsDelta: "3", xpDelta: "-1", reason: "Correcao operacional" },
      "deltas",
    ],
    [
      { pointsDelta: "-31", xpDelta: "0", reason: "Correcao operacional" },
      "balance",
    ],
    [{ pointsDelta: "1", xpDelta: "0", reason: "curto" }, "reason"],
  ])("rejects invalid adjustment input", (input, field) => {
    const result = validateAdjustment(input, { points: 30, xp: 8 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty(field);
  });
});

describe("idempotency lifecycle", () => {
  it("keeps a key for technical retry and renews it when intent changes", () => {
    const uuid = vi
      .fn()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2")
      .mockReturnValueOnce("key-3");
    const lifecycle = createIdempotencyLifecycle(uuid);

    expect(lifecycle.keyFor("same intent")).toBe("key-1");
    expect(lifecycle.keyFor("same intent")).toBe("key-1");
    expect(lifecycle.keyFor("changed intent")).toBe("key-2");
    lifecycle.succeeded();
    expect(lifecycle.keyFor("changed intent")).toBe("key-3");
  });

  it("renews a conflicting intent while preserving ordinary error retries", () => {
    const uuid = vi
      .fn()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2");
    const lifecycle = createIdempotencyLifecycle(uuid);
    expect(lifecycle.keyFor("intent")).toBe("key-1");
    lifecycle.failed(false);
    expect(lifecycle.keyFor("intent")).toBe("key-1");
    lifecycle.failed(true);
    expect(lifecycle.keyFor("intent")).toBe("key-2");
  });
});

describe("participant operation query invalidation", () => {
  it("refreshes all participant panels, dashboard and ranking when XP changes", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateParticipantOperationQueries(
      { invalidateQueries } as never,
      "participant-1",
      true,
    );
    expect(invalidateQueries.mock.calls.map(([value]) => value)).toEqual([
      { queryKey: ["admin", "participant", "participant-1"], exact: true },
      {
        queryKey: ["admin", "participant", "participant-1", "point-events"],
        exact: false,
      },
      {
        queryKey: ["admin", "participant", "participant-1", "audit-events"],
        exact: false,
      },
      {
        queryKey: ["admin", "participant", "participant-1", "reconciliation"],
        exact: true,
      },
      { queryKey: ["admin", "dashboard"], exact: true },
      { queryKey: ["ranking"], exact: true },
    ]);
  });

  it("does not refresh ranking for points-only operations", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateParticipantOperationQueries(
      { invalidateQueries } as never,
      "participant-1",
      false,
    );
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["ranking"],
      exact: true,
    });
  });
});
