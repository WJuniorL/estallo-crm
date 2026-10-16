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

/** Linha que ainda não voltou do servidor: aparece na hora, mas não se edita. */
export const ehProvisorio = (itemId: string) => itemId.startsWith("tmp-");

/**
 * Os produtos de um negócio, com as três escritas — OTIMISTAS: a lista muda na
 * hora e volta ao que era se a rota recusar. Depois de cada uma o quadro é
 * relido: o valor do negócio muda pela trigger do banco e o filtro por produto
 * lê `produtos_ids` do quadro.
 */
export function useProdutosDoNegocio(leadId: string, pipelineId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chave(leadId),
    queryFn: async () =>
      (await apiClient.get<ApiSuccess<ProdutoDoNegocio[]>>(`/api/v1/leads/${leadId}/produtos`))
        .data,
  });

  /** Aplica `mudar` na lista em cache e devolve o que havia, para desfazer. */
  async function otimista(mudar: (atual: ProdutoDoNegocio[]) => ProdutoDoNegocio[]) {
    await qc.cancelQueries({ queryKey: chave(leadId) });
    const antes = qc.getQueryData<ProdutoDoNegocio[]>(chave(leadId));
    qc.setQueryData<ProdutoDoNegocio[]>(chave(leadId), mudar(antes ?? []));
    return { antes };
  }
  const desfazer = (erro: unknown, _v: unknown, ctx?: { antes?: ProdutoDoNegocio[] }) => {
    qc.setQueryData(chave(leadId), ctx?.antes);
    showApiError(erro);
  };
  const depois = () => {
    void qc.invalidateQueries({ queryKey: chave(leadId) });
    void qc.invalidateQueries({ queryKey: chaveDoQuadro(pipelineId) });
  };

  const adicionar = useMutation({
    mutationFn: (productId: string) =>
      apiClient.post(`/api/v1/leads/${leadId}/produtos`, { product_id: productId }),
    onMutate: (productId: string) => {
      const p = qc
        .getQueryData<ProdutoDoCatalogo[]>(["catalogo-de-produtos"])
        ?.find((c) => c.id === productId);
      return otimista((atual) => [
        ...atual,
        {
          id: `tmp-${productId}-${Date.now()}`,
          lead_id: leadId,
          product_id: productId,
          nome: p?.nome ?? "…",
          quantidade: 1,
          preco_unitario_cents: p?.preco_cents ?? 0,
          desconto_cents: 0,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    onError: desfazer,
    onSettled: depois,
  });
  const alterar = useMutation({
    mutationFn: (v: { itemId: string; quantidade?: number; desconto_cents?: number }) => {
      const { itemId, ...corpo } = v;
      return apiClient.patch(`/api/v1/leads/${leadId}/produtos/${itemId}`, corpo);
    },
    onMutate: ({ itemId, ...corpo }) =>
      otimista((atual) => atual.map((i) => (i.id === itemId ? { ...i, ...corpo } : i))),
    onError: desfazer,
    onSettled: depois,
  });
  const remover = useMutation({
    mutationFn: (itemId: string) => apiClient.delete(`/api/v1/leads/${leadId}/produtos/${itemId}`),
    onMutate: (itemId: string) => otimista((atual) => atual.filter((i) => i.id !== itemId)),
    onError: desfazer,
    onSettled: depois,
  });

  return { ...query, adicionar, alterar, remover };
}
