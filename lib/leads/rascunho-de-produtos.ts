import type { ProdutoDoNegocio } from "@/lib/schemas/produtos-do-negocio";

/**
 * Os produtos do negócio enquanto a pessoa edita a ficha: NADA vai ao servidor
 * até ela clicar em "Salvar". Linha nova nasce com id `novo-…` e só ganha o id
 * do banco quando for gravada.
 */
export type ItemDoRascunho = Pick<
  ProdutoDoNegocio,
  "id" | "product_id" | "nome" | "quantidade" | "preco_unitario_cents" | "desconto_cents"
>;

export const ehNovoNoRascunho = (id: string) => id.startsWith("novo-");

export interface DiferencaDoRascunho {
  remover: string[];
  adicionar: Array<{ product_id: string; quantidade: number; desconto_cents: number }>;
  alterar: Array<{ itemId: string; quantidade?: number; desconto_cents?: number }>;
}

/** O que precisa ir ao servidor para o gravado virar o rascunho. */
export function diferencaDoRascunho(
  gravado: readonly ItemDoRascunho[],
  rascunho: readonly ItemDoRascunho[],
): DiferencaDoRascunho {
  const noRascunho = new Map(rascunho.map((i) => [i.id, i]));
  const remover = gravado.filter((i) => !noRascunho.has(i.id)).map((i) => i.id);
  const adicionar = rascunho
    .filter((i) => ehNovoNoRascunho(i.id) && i.product_id)
    .map((i) => ({
      product_id: i.product_id as string,
      quantidade: i.quantidade,
      desconto_cents: i.desconto_cents,
    }));
  const alterar: DiferencaDoRascunho["alterar"] = [];
  for (const antes of gravado) {
    const agora = noRascunho.get(antes.id);
    if (!agora) continue;
    const mudou: DiferencaDoRascunho["alterar"][number] = { itemId: antes.id };
    if (agora.quantidade !== antes.quantidade) mudou.quantidade = agora.quantidade;
    if (agora.desconto_cents !== antes.desconto_cents) mudou.desconto_cents = agora.desconto_cents;
    if (mudou.quantidade !== undefined || mudou.desconto_cents !== undefined) alterar.push(mudou);
  }
  return { remover, adicionar, alterar };
}

export function rascunhoMudou(
  gravado: readonly ItemDoRascunho[],
  rascunho: readonly ItemDoRascunho[],
) {
  const d = diferencaDoRascunho(gravado, rascunho);
  return d.remover.length + d.adicionar.length + d.alterar.length > 0;
}
