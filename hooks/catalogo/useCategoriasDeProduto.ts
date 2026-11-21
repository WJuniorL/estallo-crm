"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

export interface CategoriaDeProduto {
  id: string;
  nome: string;
}

const CHAVE = ["catalog-categories"] as const;
const BASE = "/api/v1/products/categorias";

/** As categorias cadastradas (0721), em ordem alfabética. */
export function useCategoriasDeProduto() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: () => apiClient.get<{ data: CategoriaDeProduto[] }>(BASE),
    select: (res) => res?.data ?? [],
  });
}

export function useAlterarCategorias() {
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: CHAVE });
  // Renomear muda os produtos também (gatilho da 0721): a lista deles relê.
  const invalidarProdutos = () => qc.invalidateQueries({ queryKey: ["products"] });
  return {
    criar: useMutation({
      mutationFn: (nome: string) => apiClient.post<{ data: CategoriaDeProduto }>(BASE, { nome }),
      onError: showApiError,
      onSettled: invalidar,
    }),
    renomear: useMutation({
      mutationFn: ({ id, nome }: { id: string; nome: string }) => apiClient.patch(`${BASE}/${id}`, { nome }),
      onError: showApiError,
      onSettled: () => {
        void invalidar();
        void invalidarProdutos();
      },
    }),
    apagar: useMutation({
      mutationFn: (id: string) => apiClient.delete(`${BASE}/${id}`),
      onError: showApiError,
      onSettled: invalidar,
    }),
  };
}
