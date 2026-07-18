import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import {
  createAction,
  generateClaimCodes,
  updateAction,
  updateClaimCodeStatus,
} from "./actions/actions.service";
import { updateParticipantStatus } from "./participants/participants.service";
import {
  cancelRedemption,
  createReward,
  deliverRedemption,
  updateReward,
} from "./rewards/rewards.service";
import type {
  UpdateRewardDetailsPayload,
  UpdateRewardPayload,
} from "./rewards/rewards.types";

const validRewardUpdate = {
  isActive: false,
  reason: "Motivo válido",
} satisfies UpdateRewardPayload;
const validRewardDetailsUpdate = {
  stock: 2,
  reason: "Motivo válido",
} satisfies UpdateRewardDetailsPayload;
// @ts-expect-error audited reward updates always require a reason
const invalidRewardUpdate: UpdateRewardPayload = { isActive: false };
// @ts-expect-error reward detail updates also require a reason
const invalidRewardDetailsUpdate: UpdateRewardDetailsPayload = { stock: 2 };

void validRewardUpdate;
void validRewardDetailsUpdate;
void invalidRewardUpdate;
void invalidRewardDetailsUpdate;

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));
const request = vi.mocked(apiFetch);

describe("audited admin mutation contracts", () => {
  beforeEach(() => request.mockReset());

  it("includes the normalized reason in participant, activity and code calls", () => {
    updateParticipantStatus("p1", { isActive: false, reason: "Motivo válido" });
    createAction({
      name: "Atividade",
      type: "CHECKIN",
      points: 10,
      reason: "Motivo válido",
    });
    updateAction("a1", { isActive: false, reason: "Motivo válido" });
    generateClaimCodes("a1", { quantity: 2, reason: "Motivo válido" });
    updateClaimCodeStatus("c1", {
      isActive: false,
      reason: "Motivo válido",
    });
    const bodies = request.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(bodies).toEqual([
      { isActive: false, reason: "Motivo válido" },
      {
        name: "Atividade",
        type: "CHECKIN",
        points: 10,
        reason: "Motivo válido",
      },
      { isActive: false, reason: "Motivo válido" },
      { quantity: 2, reason: "Motivo válido" },
      { isActive: false, reason: "Motivo válido" },
    ]);
  });

  it("includes reason in reward create, edit, delivery and cancellation", () => {
    createReward({
      name: "Brinde",
      costInPoints: 10,
      stock: 1,
      isActive: true,
      reason: "Motivo válido",
    });
    updateReward("r1", { isActive: false, reason: "Motivo válido" });
    deliverRedemption("d1", { reason: "Motivo válido" });
    cancelRedemption("d2", { reason: "Motivo válido" });
    expect(
      request.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([
      {
        name: "Brinde",
        costInPoints: 10,
        stock: 1,
        isActive: true,
        reason: "Motivo válido",
      },
      { isActive: false, reason: "Motivo válido" },
      { reason: "Motivo válido" },
      { reason: "Motivo válido" },
    ]);
  });
});
