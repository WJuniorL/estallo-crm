import type { Intervalo } from "@/lib/cobranca/vocabulario";

/**
 * OS PLANOS DA ESTALLO — decisão do dono em 12/11/2026.
 *
 * Três níveis, cada um em mensal, semestral (17% de desconto sobre seis
 * mensalidades) e anual (28% sobre doze), arredondados para baixo em reais
 * inteiros. É a fonte de `scripts/cobranca-planos-estallo.ts`, que grava as nove
 * linhas em `cobranca_planos`; depois disso quem vale é o banco (o dono pode
 * editar em /admin/cobranca › Planos). Sem a cobrança ligada, a tela Plano e
 * cobrança mostra este catálogo como vitrine, sem contratação.
 */

export interface LimitesDoNivel {
  max_assentos: number | null;
  max_canais: number | null;
  max_pipelines: number | null;
  max_etapas_por_pipeline: number | null;
  max_leads: number | null;
  max_automacoes: number | null;
  max_webhooks: number | null;
  libera_api: boolean;
  teto_ia_usd_cents: number | null;
}

export interface NivelDoCatalogo {
  nome: string;
  descricao: string;
  destaque: boolean;
  /** Preço de cada intervalo, em centavos, do período inteiro. */
  precos: Record<Intervalo, number>;
  limites: LimitesDoNivel;
}

export const DESCONTO_DO_INTERVALO: Record<Intervalo, number> = { mes: 0, semestre: 17, ano: 28 };
export const TRIAL_DIAS = 14;
/** O nível em que quem se cadastra começa o teste grátis (mensal). */
export const NIVEL_DO_CADASTRO = "Profissional";

/** Preço do período com o desconto, arredondado para baixo em reais inteiros. */
export function precoDoPeriodo(mensalCents: number, meses: number, descontoPct: number): number {
  return Math.floor((mensalCents * meses * (100 - descontoPct)) / 100 / 100) * 100;
}

const precos = (mensalCents: number): Record<Intervalo, number> => ({
  mes: mensalCents,
  semestre: precoDoPeriodo(mensalCents, 6, DESCONTO_DO_INTERVALO.semestre),
  ano: precoDoPeriodo(mensalCents, 12, DESCONTO_DO_INTERVALO.ano),
});

export const NIVEIS_DA_ESTALLO: readonly NivelDoCatalogo[] = [
  {
    nome: "Essencial",
    descricao: "Para começar a organizar o comercial.",
    destaque: false,
    precos: precos(24_700),
    limites: {
      max_assentos: 4, max_canais: 3, max_pipelines: 5, max_etapas_por_pipeline: 8, max_leads: 5_000,
      max_automacoes: 8, max_webhooks: 3, libera_api: false, teto_ia_usd_cents: 1_000,
    },
  },
  {
    nome: "Profissional",
    descricao: "Para equipes em crescimento que precisam integrar ferramentas.",
    destaque: true,
    precos: precos(44_700),
    limites: {
      max_assentos: 15, max_canais: 10, max_pipelines: 20, max_etapas_por_pipeline: 15, max_leads: 100_000,
      max_automacoes: 20, max_webhooks: 15, libera_api: true, teto_ia_usd_cents: 2_500,
    },
  },
  {
    nome: "Escala",
    descricao: "Para operações que escalam com volume.",
    destaque: false,
    precos: precos(94_700),
    limites: {
      max_assentos: 40, max_canais: 50, max_pipelines: null, max_etapas_por_pipeline: 25, max_leads: 500_000,
      max_automacoes: 80, max_webhooks: 80, libera_api: true, teto_ia_usd_cents: 6_000,
    },
  },
];

/** Um plano como a vitrine de Plano e cobrança o desenha. */
export interface PlanoDaVitrine extends LimitesDoNivel {
  /** `null` na vitrine sem cobrança ligada: não há o que escolher. */
  id: string | null;
  nome: string;
  preco_cents: number;
  intervalo: Intervalo;
}

/** O catálogo como vitrine, para a tela sem cobrança ligada. */
export function vitrineDoCatalogo(): PlanoDaVitrine[] {
  const intervalos: Intervalo[] = ["mes", "semestre", "ano"];
  return NIVEIS_DA_ESTALLO.flatMap((n) =>
    intervalos.map((intervalo) => ({ id: null, nome: n.nome, preco_cents: n.precos[intervalo], intervalo, ...n.limites })),
  );
}
