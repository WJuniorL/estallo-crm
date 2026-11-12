/**
 * DASHBOARD DE VENDAS — o que a tela faz com o que `fn_dashboard_vendas`
 * (migration 0719) devolve. A conta pesada é do SQL; aqui ficam as três coisas
 * que o SQL não decide: em que moeda a tela fala, quanto cada etapa deixa
 * passar (e qual é o gargalo) e quanto o período variou contra o anterior.
 *
 * Regras herdadas, que esta conta não deixa furar:
 * - **Ausência é `null`, nunca 0** (doutrina `03-medida-do-proposito.md` §3.4):
 *   taxa sem amostra e variação sem base saem `null`, e a tela mostra "—".
 * - **Moeda não mistura** (`lib/metrics/perdas.ts`): a tela escolhe UMA moeda
 *   e filtra tudo por ela; as outras aparecem como aviso, nunca somadas.
 */

import { MINIMO_DE_CASOS } from "@/lib/metrics/taxa-da-etapa";

export { MINIMO_DE_CASOS };

export interface ValorPorMoeda {
  moeda: string;
  quantidade: number;
  valor_cents: number;
}

export interface ResumoDaJanela {
  ganhos: number;
  perdidos: number;
  ciclo_mediana_dias: number | null;
  ganhos_por_moeda: ValorPorMoeda[];
  perdidos_por_moeda: ValorPorMoeda[];
}

export interface EtapaDoFluxo {
  stage_id: string;
  nome: string;
  posicao: number;
  cor: string | null;
  ganho: boolean;
  chegaram: number;
  agora: ValorPorMoeda[];
}

export interface LinhaDoRanking {
  tipo: "pessoa" | "ia" | "sem_dono";
  user_id: string | null;
  agent_id: string | null;
  agente_nome: string | null;
  moeda: string;
  ganhos: number;
  valor_cents: number;
}

export interface LinhaDeProduto {
  product_id: string | null;
  nome: string;
  moeda: string;
  quantidade: number;
  receita_cents: number;
  negocios: number;
}

export interface LinhaDePerda {
  motivo: string | null;
  quantidade: number;
}

export interface LinhaMensal {
  mes: string;
  status: "open" | "won" | "lost";
  moeda: string;
  quantidade: number;
  valor_cents: number;
}

export interface NegocioParado {
  lead_id: string;
  titulo: string;
  etapa: string | null;
  moeda: string;
  valor_cents: number;
  owner_user_id: string | null;
  na_etapa_desde: string;
}

/** O payload cru da RPC. */
export interface DashboardVendasBruto {
  fuso: string;
  origens: string[];
  carteira: ValorPorMoeda[];
  periodo: { atual: ResumoDaJanela; anterior: ResumoDaJanela };
  fluxo: EtapaDoFluxo[];
  ranking: LinhaDoRanking[];
  produtos: LinhaDeProduto[];
  perdas: LinhaDePerda[];
  mensal: LinhaMensal[];
  parados: NegocioParado[];
}

/** Quantos % o valor mudou contra o anterior; `null` quando não há base. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/** Ganhos sobre fechados; `null` quando nada fechou (não é "0% de conversão"). */
export function taxaDeConversao(r: Pick<ResumoDaJanela, "ganhos" | "perdidos">): number | null {
  const fechados = r.ganhos + r.perdidos;
  return fechados === 0 ? null : (r.ganhos / fechados) * 100;
}

export function somaNaMoeda(linhas: readonly ValorPorMoeda[], moeda: string): ValorPorMoeda {
  const l = linhas.find((x) => x.moeda === moeda);
  return { moeda, quantidade: l?.quantidade ?? 0, valor_cents: l?.valor_cents ?? 0 };
}

/** Ticket médio dos ganhos na moeda; `null` sem ganho nela. */
export function ticketMedio(linhas: readonly ValorPorMoeda[], moeda: string): number | null {
  const l = somaNaMoeda(linhas, moeda);
  return l.quantidade === 0 ? null : l.valor_cents / l.quantidade;
}

/**
 * As moedas presentes, a mais usada primeiro (a que a tela adota de saída).
 * "sem moeda" vai por último: é balde de dado faltando, não moeda.
 */
export function moedasPresentes(d: DashboardVendasBruto): string[] {
  const peso = new Map<string, number>();
  const somar = (moeda: string, n: number) => peso.set(moeda, (peso.get(moeda) ?? 0) + n);
  for (const l of d.carteira) somar(l.moeda, l.quantidade);
  for (const l of d.periodo.atual.ganhos_por_moeda) somar(l.moeda, l.quantidade);
  for (const l of d.periodo.atual.perdidos_por_moeda) somar(l.moeda, l.quantidade);
  for (const l of d.mensal) somar(l.moeda, l.quantidade);
  return [...peso.entries()]
    .sort(
      (a, b) =>
        Number(a[0] === "sem moeda") - Number(b[0] === "sem moeda") ||
        b[1] - a[1] ||
        a[0].localeCompare(b[0]),
    )
    .map(([moeda]) => moeda);
}

export interface PassagemDaEtapa extends EtapaDoFluxo {
  /** Quantos dos que chegaram aqui chegaram à próxima; `null` na última ou sem amostra. */
  avancaram_pct: number | null;
  gargalo: boolean;
}

/**
 * Taxa de passagem de cada etapa para a seguinte e o gargalo: a etapa com a
 * MENOR passagem entre as que têm amostra de pelo menos `MINIMO_DE_CASOS`.
 * Abaixo da régua não há gargalo — dois negócios não dizem onde o funil trava.
 */
export function montarFluxo(fluxo: readonly EtapaDoFluxo[]): PassagemDaEtapa[] {
  const linhas: PassagemDaEtapa[] = fluxo.map((e, i) => {
    const proxima = fluxo[i + 1];
    const avancaram_pct =
      proxima && e.chegaram > 0 ? Math.min(100, (proxima.chegaram / e.chegaram) * 100) : null;
    return { ...e, avancaram_pct, gargalo: false };
  });
  let pior: PassagemDaEtapa | null = null;
  for (const l of linhas) {
    if (l.avancaram_pct == null || l.chegaram < MINIMO_DE_CASOS) continue;
    if (l.avancaram_pct >= 100) continue;
    if (!pior || l.avancaram_pct < (pior.avancaram_pct ?? Infinity)) pior = l;
  }
  if (pior) pior.gargalo = true;
  return linhas;
}

export interface MesDaEvolucao {
  mes: string;
  won: number;
  lost: number;
  open: number;
}

/**
 * 12 meses contínuos terminando em `mesFinal` (YYYY-MM), na métrica pedida e na
 * moeda escolhida. Mês sem negócio aparece com zero — ali o zero é medido.
 */
export function evolucaoMensal(
  mensal: readonly LinhaMensal[],
  mesFinal: string,
  moeda: string,
  metrica: "valor" | "quantidade",
): MesDaEvolucao[] {
  const ano = Number(mesFinal.slice(0, 4));
  const mes = Number(mesFinal.slice(5, 7));
  const meses: MesDaEvolucao[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    meses.push({
      mes: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      won: 0,
      lost: 0,
      open: 0,
    });
  }
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  for (const l of mensal) {
    const alvo = porMes.get(l.mes);
    if (!alvo) continue;
    // Quantidade é independente de moeda; valor só soma na moeda escolhida.
    if (metrica === "valor" && l.moeda !== moeda) continue;
    alvo[l.status] += metrica === "valor" ? l.valor_cents : l.quantidade;
  }
  return meses;
}
