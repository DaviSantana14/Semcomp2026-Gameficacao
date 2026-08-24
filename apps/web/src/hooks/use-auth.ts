"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchMe } from "@/features/users/users.service";
import { ApiError } from "@/lib/http/api-error";

export function useMe() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
  });

  const passwordChangeRequired =
    query.error instanceof ApiError &&
    query.error.status === 403 &&
    query.error.code === "PASSWORD_CHANGE_REQUIRED";

  useEffect(() => {
    if (passwordChangeRequired) router.replace("/trocar-senha");
  }, [passwordChangeRequired, router]);

  return query;
}
