"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "@/features/users/users.service";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
  });
}
