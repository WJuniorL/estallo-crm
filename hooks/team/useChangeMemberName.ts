"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

/** O admin da organização corrige o nome de exibição de um membro. */
export function useChangeMemberName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, fullName }: { userId: string; fullName: string }) =>
      apiClient.patch(`/api/v1/team/${userId}/name`, { full_name: fullName }),
    onError: (err) => showApiError(err),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
