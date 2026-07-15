import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type {
  AdminAuditEvent,
  AuditSnapshot,
} from "@/features/audit/audit.types";
import {
  actorLabels,
  entityLabels,
  operationLabels,
  snapshotFieldLabels,
  snapshotValueLabels,
} from "./audit-labels";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function AuditEventList({
  events,
  selectedId,
  onSelect,
}: {
  events: AdminAuditEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = events.find((event) => event.id === selectedId);
  return (
    <div className="grid gap-3">
      <div className="hidden overflow-x-auto rounded-md border border-border bg-card/90 md:block">
        <table
          aria-label="Eventos de auditoria"
          className="w-full min-w-[64rem] border-collapse text-left text-sm"
        >
          <thead className="border-b border-border bg-muted/50 font-mono text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Operação</th>
              <th className="px-3 py-3">Ator</th>
              <th className="px-3 py-3">Entidade</th>
              <th className="px-3 py-3">Participante</th>
              <th className="px-3 py-3">Request ID</th>
              <th className="w-12 px-3 py-3">
                <span className="sr-only">Detalhes</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr className="align-top hover:bg-muted/30" key={event.id}>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                  {formatDate(event.createdAt)}
                </td>
                <td className="max-w-64 px-3 py-3 font-semibold">
                  {operationLabels[event.operation]}
                </td>
                <td className="px-3 py-3">
                  <Actor event={event} />
                </td>
                <td className="px-3 py-3">
                  <Entity event={event} />
                </td>
                <td className="px-3 py-3">
                  <Participant event={event} />
                </td>
                <td className="max-w-40 break-all px-3 py-3 font-mono text-xs">
                  {event.requestId}
                </td>
                <td className="px-2 py-2">
                  <DetailButton
                    announceText
                    event={event}
                    selected={selectedId === event.id}
                    onSelect={onSelect}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul
        aria-label="Eventos de auditoria em tela pequena"
        className="grid gap-3 md:hidden"
      >
        {events.map((event) => (
          <li
            className="grid min-w-0 gap-3 overflow-hidden rounded-md border border-border bg-card/90 p-4"
            key={event.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {operationLabels[event.operation]}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {formatDate(event.createdAt)}
                </p>
              </div>
              <DetailButton
                event={event}
                selected={selectedId === event.id}
                onSelect={onSelect}
              />
            </div>
            <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <MobileField label="Ator">
                <Actor event={event} />
              </MobileField>
              <MobileField label="Entidade">
                <Entity event={event} />
              </MobileField>
              <MobileField label="Participante">
                <Participant event={event} />
              </MobileField>
              <MobileField label="Request ID">
                <span className="break-all font-mono text-xs">
                  {event.requestId}
                </span>
              </MobileField>
            </dl>
          </li>
        ))}
      </ul>
      {selected ? <AuditEventDetail event={selected} /> : null}
    </div>
  );
}

function DetailButton({
  announceText = false,
  event,
  selected,
  onSelect,
}: {
  announceText?: boolean;
  event: AdminAuditEvent;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const Icon = selected ? ChevronUp : ChevronDown;
  const detailId = getDetailId(event.id);
  return (
    <Button
      aria-controls={detailId}
      aria-expanded={selected}
      aria-label={`${selected ? "Ocultar" : "Ver"} detalhes de ${operationLabels[event.operation]}`}
      className="size-9 p-0"
      onClick={() => onSelect(selected ? null : event.id)}
      variant="ghost"
    >
      <Icon aria-hidden="true" />
      {announceText ? (
        <span className="sr-only">
          {selected ? "Ocultar detalhes" : "Ver detalhes"}
        </span>
      ) : null}
    </Button>
  );
}

function Actor({ event }: { event: AdminAuditEvent }) {
  const name = displayText(event.actorDisplay?.name);
  const email = displayText(event.actorDisplay?.email);
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="break-words font-medium">
        {name ?? actorLabels[event.actorType]}
      </span>
      {email ? (
        <span className="break-all text-xs text-muted-foreground">{email}</span>
      ) : null}
      {event.actorAdminId ? (
        <span className="break-all font-mono text-xs text-muted-foreground">
          {event.actorAdminId}
        </span>
      ) : null}
    </span>
  );
}

function Entity({ event }: { event: AdminAuditEvent }) {
  const name = displayText(event.entityDisplay?.name);
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="break-words font-medium">
        {name ?? entityLabels[event.entityType]}
      </span>
      <span className="break-all font-mono text-xs text-muted-foreground">
        {event.entityId}
      </span>
    </span>
  );
}

function Participant({ event }: { event: AdminAuditEvent }) {
  const id = event.participantId;
  const name = displayText(event.participantDisplay?.name);
  const email = displayText(event.participantDisplay?.email);
  return id ? (
    <Link
      className="grid min-w-0 gap-0.5 underline-offset-4 hover:text-primary hover:underline"
      href={`/admin/participantes/${id}`}
    >
      <span
        className={
          name
            ? "break-words font-medium"
            : "break-all font-mono text-xs text-muted-foreground"
        }
      >
        {name ?? id}
      </span>
      {email ? (
        <span className="break-all text-xs text-muted-foreground">{email}</span>
      ) : null}
      {name ? (
        <span className="break-all font-mono text-xs text-muted-foreground">
          {id}
        </span>
      ) : null}
    </Link>
  ) : (
    <span className="text-muted-foreground">Não relacionado</span>
  );
}

function displayText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function MobileField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 min-w-0">{children}</dd>
    </div>
  );
}

function AuditEventDetail({ event }: { event: AdminAuditEvent }) {
  const detailId = getDetailId(event.id);
  const titleId = `${detailId}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-5 rounded-md border border-primary/30 bg-card/95 p-4 md:p-5"
      id={detailId}
      role="region"
    >
      <div className="grid gap-1">
        <h3 className="font-black" id={titleId}>
          Detalhes do evento
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {event.reason}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <MobileField label="Evento">
          <span className="break-all font-mono text-xs">{event.id}</span>
        </MobileField>
        <MobileField label="Request ID">
          <span className="break-all font-mono text-xs">{event.requestId}</span>
        </MobileField>
        <MobileField label="Registrado em">
          {formatDate(event.createdAt)}
        </MobileField>
      </dl>
      <div className="grid gap-4 lg:grid-cols-3">
        <SafeFields title="Antes" snapshot={event.before} />
        <SafeFields title="Depois" snapshot={event.after} />
        <SafeFields title="Metadados" snapshot={event.metadata} />
      </div>
    </section>
  );
}

function SafeFields({
  title,
  snapshot,
}: {
  title: string;
  snapshot: AuditSnapshot | null;
}) {
  const fields = snapshot
    ? Object.entries(snapshot).filter(
        ([key, value]) =>
          Object.hasOwn(snapshotFieldLabels, key) && isSafeValue(value),
      )
    : [];
  return (
    <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <h4 className="font-mono text-xs uppercase text-muted-foreground">
        {title}
      </h4>
      {fields.length ? (
        <dl className="mt-3 grid gap-3">
          {fields.map(([key, value]) => (
            <div className="min-w-0" key={key}>
              <dt className="text-xs text-muted-foreground">
                {snapshotFieldLabels[key]}
              </dt>
              <dd className="mt-0.5 break-words font-mono text-xs">
                {formatValue(
                  key,
                  value as string | number | boolean | null | string[],
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Sem dados registrados.
        </p>
      )}
    </section>
  );
}

function isSafeValue(
  value: unknown,
): value is string | number | boolean | null | string[] {
  return (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value) ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function formatValue(
  key: string,
  value: string | number | boolean | null | string[],
) {
  if (value === null) return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" && Object.hasOwn(snapshotValueLabels, key)) {
    const labels = snapshotValueLabels[key as keyof typeof snapshotValueLabels];
    return Object.hasOwn(labels, value)
      ? (labels as Record<string, string>)[value]
      : "Valor não reconhecido";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))
    return formatDate(value);
  return String(value);
}

function getDetailId(eventId: string) {
  return `audit-event-detail-${eventId}`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Data indisponível"
    : dateTime.format(parsed);
}
