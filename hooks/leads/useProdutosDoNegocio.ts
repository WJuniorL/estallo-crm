"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { chaveDoQuadro } from "@/hooks/kanban/useBoard";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import type { ProdutoDoNegocio } from "@/lib/schemas/produtos-do-negocio";

/** O que o seletor e o filtro precisam de um produto do catálogo. */
export interface ProdutoDoCatalogo {
  id: string;
  nome: string;
  preco_cents: number;
  ativo: boolean;
}

/**
 * O catálogo inteiro da organização (a rota devolve até 500, ativos primeiro).
 * Cache de 5 min: o card e o filtro do quadro leem a mesma lista.
 */
export function useCatalogoDeProdutos(enabled = true) {
  return useQuery({
    queryKey: ["catalogo-de-produtos"],
    queryFn: async () =>
      (await apiClient.get<ApiSuccess<ProdutoDoCatalogo[]>>("/api/v1/products")).data,
    staleTime: 5 * 60_000,
    enabled,
  });
}

const chave = (leadId: string) => ["produtos-do-negocio", leadId] as const;

/**
 * Os produtos de um negócio, com as três escritas. Depois de cada uma o quadro é
 * invalidado: o valor do negócio muda pela trigger do banco e o filtro por
 * produto lê `produtos_ids` do quadro.
 */
export function useProdutosDoNegocio(leadId: string, pipelineId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chave(leadId),
    queryFn: async () =>
      (
        await apiClient.get<ApiSuccess<ProdutoDoNegocio[]>>(`/api/v1/leads/${leadId}/produtos`)
      ).data,
  });

  const depois = () => {
    void qc.invalidateQueries({ queryKey: chave(leadId) });
    void qc.invalidateQueries({ queryKey: chaveDoQuadro(pipelineId) });
  };

  const adicionar = useMutation({
    mutationFn: (productId: string) =>
      apiClient.post(`/api/v1/leads/${leadId}/produtos`, { product_id: productId }),
    onSuccess: depois,
    onError: showApiError,
  });
  const alterar = useMutation({
    mutationFn: (v: { itemId: string; quantidade?: number; desconto_cents?: number }) => {
      const { itemId, ...corpo } = v;
      return apiClient.patch(`/api/v1/leads/${leadId}/produtos/${itemId}`, corpo);
    },
    onSuccess: depois,
    onError: showApiError,
  });
  const remover = useMutation({
    mutationFn: (itemId: string) => apiClient.delete(`/api/v1/leads/${leadId}/produtos/${itemId}`),
    onSuccess: depois,
    onError: showApiError,
  });

  return { ...query, adicionar, alterar, remover };
}
