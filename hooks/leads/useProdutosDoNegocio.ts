"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { chaveDoQuadro } from "@/hooks/kanban/useBoard";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { diferencaDoRascunho, type ItemDoRascunho } from "@/lib/leads/rascunho-de-produtos";
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
 * Os produtos de um negócio e a gravação do RASCUNHO da ficha. Nada aqui grava
 * por clique: `gravar` é chamado pelo "Salvar" do `LeadFieldsForm`, com o
 * rascunho inteiro, e manda só a diferença. Depois o quadro é relido: o valor
 * do negócio muda pela trigger do banco e o filtro por produto lê
 * `produtos_ids` do quadro.
 */
export function useProdutosDoNegocio(leadId: string, pipelineId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chave(leadId),
    queryFn: async () =>
      (await apiClient.get<ApiSuccess<ProdutoDoNegocio[]>>(`/api/v1/leads/${leadId}/produtos`))
        .data,
  });

  /** Leva o rascunho ao servidor. Lança no primeiro erro (quem chama mostra). */
  async function gravar(rascunho: readonly ItemDoRascunho[]) {
    const d = diferencaDoRascunho(query.data ?? [], rascunho);
    try {
      await Promise.all([
        ...d.remover.map((itemId) =>
          apiClient.delete(`/api/v1/leads/${leadId}/produtos/${itemId}`),
        ),
        ...d.alterar.map(({ itemId, ...corpo }) =>
          apiClient.patch(`/api/v1/leads/${leadId}/produtos/${itemId}`, corpo),
        ),
        ...d.adicionar.map((corpo) => apiClient.post(`/api/v1/leads/${leadId}/produtos`, corpo)),
      ]);
    } finally {
      await qc.invalidateQueries({ queryKey: chave(leadId) });
      void qc.invalidateQueries({ queryKey: chaveDoQuadro(pipelineId) });
    }
  }

  return { ...query, gravar };
}
