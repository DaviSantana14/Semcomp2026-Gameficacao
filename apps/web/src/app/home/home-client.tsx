"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchRanking } from "@/features/ranking/ranking.service";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/http/api-error";
import { ParticipantDashboard } from "./participant-dashboard";

export function HomeClient() {
  const router = useRouter();
  const { data: user, error, isLoading } = useMe();
  const participantId = user?.role === "PARTICIPANT" ? user.id : null;
  const { data: ranking } = useQuery({
    enabled: Boolean(participantId),
    queryFn: () => fetchRanking(1, "all"),
    queryKey: ["ranking", "home", "all", participantId],
    retry: false,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      router.replace("/admin");
    }
  }, [router, user]);

  if (isLoading) {
    return (
      <main className="semcomp-atmosphere min-h-dvh px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-7">
          <div className="h-28 max-w-3xl rounded-[20px] bg-card/70" />
          <div className="h-72 rounded-[24px] border border-secondary/15 bg-secondary/15" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="h-32 rounded-[18px] bg-card/70" key={index} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!user || user.role !== "PARTICIPANT") {
    return null;
  }

  return (
    <ParticipantDashboard
      position={ranking?.me?.position ?? null}
      user={user}
    />
  );
}
