import { ParticipantDetailClient } from "./participant-detail-client";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ParticipantDetailClient id={id} />;
}
