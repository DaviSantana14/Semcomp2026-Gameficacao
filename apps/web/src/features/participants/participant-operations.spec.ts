import { QueryClient, QueryObserver } from "@tanstack/react-query";
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
  it("invalidates and refetches a parameterized ranking when XP changes", async () => {
    const queryClient = new QueryClient();
    const rankingKey = ["ranking", "all", 10] as const;
    let finishRefetch!: (value: { version: number }) => void;
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ version: 1 })
      .mockImplementationOnce(
        () =>
          new Promise<{ version: number }>((resolve) => {
            finishRefetch = resolve;
          }),
      );
    await queryClient.fetchQuery({
      queryKey: rankingKey,
      queryFn,
      staleTime: Infinity,
    });
    const observer = new QueryObserver(queryClient, {
      queryKey: rankingKey,
      queryFn,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    const invalidation = invalidateParticipantOperationQueries(
      queryClient,
      "participant-1",
      true,
    );
    await vi.waitFor(() => {
      expect(queryClient.getQueryState(rankingKey)?.isInvalidated).toBe(true);
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
    finishRefetch({ version: 2 });
    await invalidation;

    expect(queryClient.getQueryData(rankingKey)).toEqual({ version: 2 });
    expect(queryClient.getQueryState(rankingKey)?.isInvalidated).toBe(false);
    unsubscribe();
    queryClient.clear();
  });

  it("does not invalidate a parameterized ranking for points-only operations", async () => {
    const queryClient = new QueryClient();
    const rankingKey = ["ranking", "daily", 10] as const;
    const queryFn = vi.fn().mockResolvedValue({ version: 1 });
    await queryClient.fetchQuery({
      queryKey: rankingKey,
      queryFn,
      staleTime: Infinity,
    });

    await invalidateParticipantOperationQueries(
      queryClient,
      "participant-1",
      false,
    );

    expect(queryClient.getQueryState(rankingKey)?.isInvalidated).toBe(false);
    expect(queryFn).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
