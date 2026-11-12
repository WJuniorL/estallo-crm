import type { LimitesDoNivel } from "@/lib/planos/catalogo";

/**
 * O que um plano inclui, em frases do dicionário, a partir dos LIMITES — a
 * vitrine nunca promete um número que o banco não aplica. `{n}` e `{e}` são
 * trocados por quem desenha (já no formato do idioma).
 */
export interface ItemDoPlano {
  frase: string;
  n?: number;
  e?: number;
  /** n é dinheiro em centavos de dólar. */
  usd?: boolean;
}

export function itensDoPlano(l: LimitesDoNivel): ItemDoPlano[] {
  const itens: ItemDoPlano[] = [];
  const contavel = (n: number | null, comTeto: string, semTeto: string) =>
    itens.push(n === null ? { frase: semTeto } : { frase: comTeto, n });

  contavel(l.max_assentos, "Até {n} pessoas na equipe", "Pessoas ilimitadas na equipe");
  contavel(l.max_canais, "Multiatendimento: até {n} conexões (WhatsApp, Instagram e outros)", "Conexões ilimitadas (WhatsApp, Instagram e outros)");
  if (l.max_pipelines === null) {
    itens.push(l.max_etapas_por_pipeline === null ? { frase: "Pipelines e etapas ilimitados" } : { frase: "Pipelines ilimitados com até {e} etapas", e: l.max_etapas_por_pipeline });
  } else {
    itens.push(
      l.max_etapas_por_pipeline === null
        ? { frase: "Até {n} pipelines", n: l.max_pipelines }
        : { frase: "Até {n} pipelines com até {e} etapas", n: l.max_pipelines, e: l.max_etapas_por_pipeline },
    );
  }
  itens.push({ frase: "Gestão de negócios e produtos" });
  contavel(l.max_leads, "Até {n} leads", "Leads ilimitados");
  contavel(l.max_automacoes, "{n} automações", "Automações ilimitadas");
  contavel(l.max_webhooks, "{n} integrações via webhook", "Integrações via webhook ilimitadas");
  if (l.libera_api) itens.push({ frase: "API REST para integrações externas" });
  itens.push(
    l.teto_ia_usd_cents === null
      ? { frase: "Agente de IA sem teto de uso" }
      : { frase: "Agente de IA com até {n} de uso por mês", n: l.teto_ia_usd_cents, usd: true },
  );
  return itens;
}
