export const participantQueryKeys = {
  detail: (id: string) => ["admin", "participant", id] as const,
  pointEvents: (id: string) =>
    ["admin", "participant", id, "point-events"] as const,
  auditEvents: (id: string) =>
    ["admin", "participant", id, "audit-events"] as const,
  reconciliation: (id: string) =>
    ["admin", "participant", id, "reconciliation"] as const,
};
