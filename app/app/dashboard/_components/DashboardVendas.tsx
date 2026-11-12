"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/empty/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useTeamMembers } from "@/hooks/team/useTeamMembers";
import { apiClient } from "@/lib/api/client";
import {
  type DashboardVendasBruto,
  MINIMO_DE_CASOS,
  evolucaoMensal,
  moedasPresentes,
  montarFluxo,
  somaNaMoeda,
  taxaDeConversao,
  ticketMedio,
  variacao,
} from "@/lib/metrics/dashboard-vendas";
import {
  ChartBar,
  ChartLineUp,
  Clock,
  Funnel,
  Gauge,
  Info,
  Package,
  Robot,
  Snowflake,
  TrendDown,
  Trophy,
  Warning,
} from "@/lib/ui/icons";

type Payload = DashboardVendasBruto & {
  janela: { from: string; to: string };
  nomes: Record<string, string | null>;
};

interface Funil {
  id: string;
  nome: string;
  padrao: boolean;
}

const TODOS = "__todos__";
const DIA = 24 * 60 * 60 * 1000;

type Periodo = "7d" | "30d" | "90d" | "mes" | "mes_anterior" | "12m";

function janelaDo(periodo: Periodo, agora = new Date()): { from: Date; to: Date } {
  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  switch (periodo) {
    case "7d":
      return { from: new Date(agora.getTime() - 7 * DIA), to: agora };
    case "90d":
      return { from: new Date(agora.getTime() - 90 * DIA), to: agora };
    case "mes":
      return { from: inicioDoMes, to: agora };
    case "mes_anterior":
      return { from: new Date(agora.getFullYear(), agora.getMonth() - 1, 1), to: inicioDoMes };
    case "12m":
      return { from: new Date(agora.getTime() - 365 * DIA), to: agora };
    default:
      return { from: new Date(agora.getTime() - 30 * DIA), to: agora };
  }
}

function useDinheiro() {
  const tag = useTagDeIdioma();
  return (cents: number, moeda: string, compacto = false) => {
    const opcoes: Intl.NumberFormatOptions = compacto
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (/^[A-Z]{3}$/.test(moeda)) {
      return (cents / 100).toLocaleString(tag, { style: "currency", currency: moeda, ...opcoes });
    }
    return (cents / 100).toLocaleString(tag, opcoes);
  };
}

function Cartao({
  titulo,
  subtitulo,
  icone,
  acao,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: string;
  icone: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            {icone}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text">{titulo}</h2>
            {subtitulo ? <p className="text-xs text-text-muted">{subtitulo}</p> : null}
          </div>
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

function Alternador<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex rounded-lg bg-surface-elevated p-0.5 text-xs">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            valor === o.valor ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Variacao({ pct, inverso = false }: { pct: number | null; inverso?: boolean }) {
  const t = useT();
  if (pct == null) return <span className="text-xs text-text-subtle">{t("sem base anterior")}</span>;
  const bom = inverso ? pct <= 0 : pct >= 0;
  return (
    <span className={`text-xs font-medium ${bom ? "text-success" : "text-error"}`}>
      {pct >= 0 ? "↑" : "↓"} {Math.abs(pct).toFixed(1).replace(".", ",")}%{" "}
      <span className="font-normal text-text-subtle">{t("vs. período anterior")}</span>
    </span>
  );
}

function Barra({ pct, cor = "bg-accent" }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function DashboardVendas({ funis, podeComparar }: { funis: Funil[]; podeComparar: boolean }) {
  const t = useT();
  const dinheiro = useDinheiro();
  const tag = useTagDeIdioma();

  const [funil, setFunil] = useState(() => (funis.find((f) => f.padrao) ?? funis[0])?.id ?? "");
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [dono, setDono] = useState(TODOS);
  const [origem, setOrigem] = useState(TODOS);
  const [moedaEscolhida, setMoedaEscolhida] = useState<string | null>(null);
  const [metricaPipeline, setMetricaPipeline] = useState<"valor" | "qtd">("valor");
  const [metricaMensal, setMetricaMensal] = useState<"valor" | "quantidade">("valor");

  const equipe = useTeamMembers({ enabled: podeComparar });
  const janela = useMemo(() => janelaDo(periodo), [periodo]);

  const consulta = useQuery({
    queryKey: ["dashboard", "vendas", funil, periodo, dono, origem],
    enabled: Boolean(funil),
    staleTime: 30_000,
    queryFn: async () => {
      const qs = new URLSearchParams({
        pipeline_id: funil,
        from: janela.from.toISOString(),
        to: janela.to.toISOString(),
      });
      if (dono !== TODOS) qs.set("owner_user_id", dono);
      if (origem !== TODOS) qs.set("source", origem);
      const res = await apiClient.get<{ data: Payload }>(`/api/v1/dashboard/vendas?${qs}`);
      return res.data;
    },
  });

  if (funis.length === 0) {
    return (
      <EmptyState
        icon={Funnel}
        headline={t("Nenhum funil ainda")}
        subcopy={t("Crie um funil no Kanban para ver o dashboard de vendas.")}
        primary={{ label: t("Abrir o Kanban"), href: "/app/kanban" }}
      />
    );
  }

  const d = consulta.data;
  const moedas = d ? moedasPresentes(d) : [];
  const moeda = moedaEscolhida && moedas.includes(moedaEscolhida) ? moedaEscolhida : (moedas[0] ?? "BRL");

  const periodos: { valor: Periodo; rotulo: string }[] = [
    { valor: "7d", rotulo: t("Últimos 7 dias") },
    { valor: "30d", rotulo: t("Últimos 30 dias") },
    { valor: "90d", rotulo: t("Últimos 90 dias") },
    { valor: "mes", rotulo: t("Este mês") },
    { valor: "mes_anterior", rotulo: t("Mês anterior") },
    { valor: "12m", rotulo: t("Últimos 12 meses") },
  ];
  const membros = (equipe.data?.data ?? []).filter((m) => m.accepted_at && !m.revoked_at);

  const filtros = (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <Filtro rotulo={t("Funil")}>
        <Select value={funil} onValueChange={setFunil}>
          <SelectTrigger className="w-56" aria-label={t("Funil")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {funis.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Filtro>
      <Filtro rotulo={t("Período")}>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-48" aria-label={t("Período")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodos.map((p) => (
              <SelectItem key={p.valor} value={p.valor}>
                {p.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Filtro>
      {podeComparar ? (
        <Filtro rotulo={t("Responsável")}>
          <Select value={dono} onValueChange={setDono}>
            <SelectTrigger className="w-52" aria-label={t("Responsável")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>{t("Toda a equipe")}</SelectItem>
              {membros.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.email ?? m.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filtro>
      ) : null}
      <Filtro rotulo={t("Origem")}>
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger className="w-48" aria-label={t("Origem")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t("Todas as origens")}</SelectItem>
            {(d?.origens ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Filtro>
      {moedas.length > 1 ? (
        <Filtro rotulo={t("Moeda")}>
          <Select value={moeda} onValueChange={setMoedaEscolhida}>
            <SelectTrigger className="w-36" aria-label={t("Moeda")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {moedas.map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "sem moeda" ? t("Sem moeda") : m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filtro>
      ) : null}
    </div>
  );

  if (consulta.isLoading || !d) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label={t("Carregando o dashboard")}>
        {filtros}
        {consulta.isError ? (
          <EmptyState
            icon={Warning}
            headline={t("Não foi possível carregar o dashboard")}
            subcopy={t("Tente de novo em instantes.")}
            primary={{ label: t("Tentar de novo"), onClick: () => void consulta.refetch() }}
          />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <Skeleton className="h-64 lg:col-span-2" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-72 w-full" />
          </>
        )}
      </div>
    );
  }

  const atual = d.periodo.atual;
  const anterior = d.periodo.anterior;
  const carteira = somaNaMoeda(d.carteira, moeda);
  const ganhos = somaNaMoeda(atual.ganhos_por_moeda, moeda);
  const perdidos = somaNaMoeda(atual.perdidos_por_moeda, moeda);
  const ganhosAntes = somaNaMoeda(anterior.ganhos_por_moeda, moeda);
  const conversao = taxaDeConversao(atual);
  const conversaoAntes = taxaDeConversao(anterior);
  const ticket = ticketMedio(atual.ganhos_por_moeda, moeda);
  const ticketAntes = ticketMedio(anterior.ganhos_por_moeda, moeda);
  const fluxo = montarFluxo(d.fluxo);
  const topoDoFluxo = Math.max(1, ...fluxo.map((e) => e.chegaram));
  const ranking = d.ranking.filter((r) => r.moeda === moeda);
  const maiorDoRanking = Math.max(1, ...ranking.map((r) => r.valor_cents));
  const produtos = d.produtos.filter((p) => p.moeda === moeda);
  const maiorProduto = Math.max(1, ...produtos.map((p) => p.receita_cents));
  const totalPerdas = d.perdas.reduce((s, p) => s + p.quantidade, 0);
  const mesFinal = new Date(new Date(d.janela.to).getTime() - 1).toISOString().slice(0, 7);
  const meses = evolucaoMensal(d.mensal, mesFinal, moeda, metricaMensal);
  const outrasMoedas = moedas.filter((m) => m !== moeda);

  const blocos = [
    {
      chave: "ganhos",
      rotulo: t("Ganhos no período"),
      cor: "bg-brand-green",
      valor: ganhos.valor_cents,
      qtd: ganhos.quantidade,
    },
    {
      chave: "abertos",
      rotulo: t("Em aberto agora"),
      cor: "bg-accent-300",
      valor: carteira.valor_cents,
      qtd: carteira.quantidade,
    },
    {
      chave: "perdidos",
      rotulo: t("Perdidos no período"),
      cor: "bg-error",
      valor: perdidos.valor_cents,
      qtd: perdidos.quantidade,
    },
  ];
  const medida = (b: (typeof blocos)[number]) => (metricaPipeline === "valor" ? b.valor : b.qtd);
  const totalBlocos = blocos.reduce((s, b) => s + medida(b), 0);
  const nomeDo = (id: string | null) => (id ? (d.nomes[id] ?? t("Pessoa sem nome")) : t("Sem responsável"));
  // "Agora" é o instante em que os dados chegaram, não o do render: parado
  // há N dias é uma leitura daquele momento.
  const dias = (iso: string) =>
    Math.max(0, Math.floor((consulta.dataUpdatedAt - new Date(iso).getTime()) / DIA));
  const rotuloDoMes = (mes: string) =>
    new Date(`${mes}-01T12:00:00Z`).toLocaleDateString(tag, { month: "short", year: "2-digit", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-6">
      {filtros}

      {outrasMoedas.length > 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-info-bg px-3 py-2 text-xs text-info-fg">
          <Info size={14} />
          {t("Valores em outras moedas não entram na soma. Troque a moeda no filtro para vê-los.")}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pipeline */}
        <section className="rounded-xl bg-gradient-to-br from-accent-900 via-accent-800 to-accent-700 p-5 text-white lg:col-span-2">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t("Pipeline")}</h2>
              <p className="text-xs text-white/75">{t("Ganhos e perdidos no período; em aberto, agora.")}</p>
            </div>
            <div role="group" aria-label={t("Medida do pipeline")} className="flex rounded-lg bg-white/10 p-0.5 text-xs">
              {(["valor", "qtd"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metricaPipeline === m}
                  onClick={() => setMetricaPipeline(m)}
                  className={`rounded-md px-2.5 py-1 font-medium ${
                    metricaPipeline === m ? "bg-white text-accent-900" : "text-white/80 hover:text-white"
                  }`}
                >
                  {m === "valor" ? t("Valor") : t("Qtd")}
                </button>
              ))}
            </div>
          </header>
          <p className="text-3xl font-semibold">
            {metricaPipeline === "valor" ? dinheiro(totalBlocos, moeda) : totalBlocos.toLocaleString(tag)}
            <span className="ml-2 text-sm font-normal text-white/75">
              {(ganhos.quantidade + carteira.quantidade + perdidos.quantidade).toLocaleString(tag)}{" "}
              {t("negócios")}
            </span>
          </p>
          <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-white/15">
            {blocos.map((b) =>
              totalBlocos > 0 ? (
                <div key={b.chave} className={b.cor} style={{ width: `${(medida(b) / totalBlocos) * 100}%` }} />
              ) : null,
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {blocos.map((b) => (
              <div key={b.chave} className="rounded-lg bg-white/10 p-3">
                <div className="flex items-center justify-between text-xs text-white/80">
                  <span className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${b.cor}`} />
                    {b.rotulo}
                  </span>
                  <span>{totalBlocos > 0 ? `${((medida(b) / totalBlocos) * 100).toFixed(1).replace(".", ",")}%` : "—"}</span>
                </div>
                <p className="mt-1 text-lg font-semibold">{dinheiro(b.valor, moeda)}</p>
                <p className="text-xs text-white/75">
                  {b.qtd.toLocaleString(tag)} {t("negócios")}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Indicadores */}
        <Cartao titulo={t("Indicadores-chave")} subtitulo={t("Eficiência do funil no período")} icone={<Gauge size={16} />}>
          <ul className="flex flex-col divide-y divide-border">
            <Indicador
              rotulo={t("Taxa de conversão")}
              detalhe={`${atual.ganhos} ${t("ganhos de")} ${atual.ganhos + atual.perdidos} ${t("fechados")}`}
              valor={conversao == null ? "—" : `${conversao.toFixed(1).replace(".", ",")}%`}
              variacao={<Variacao pct={variacao(conversao, conversaoAntes)} />}
            />
            <Indicador
              rotulo={t("Ticket médio ganho")}
              detalhe={`${t("sobre")} ${ganhos.quantidade} ${t("vendas")}`}
              valor={ticket == null ? "—" : dinheiro(ticket, moeda)}
              variacao={<Variacao pct={variacao(ticket, ticketAntes)} />}
            />
            <Indicador
              rotulo={t("Ciclo de vendas")}
              detalhe={t("mediana entre criar e ganhar")}
              valor={
                atual.ciclo_mediana_dias == null
                  ? "—"
                  : `${atual.ciclo_mediana_dias.toFixed(1).replace(".", ",")} ${t("dias")}`
              }
              variacao={
                <Variacao pct={variacao(atual.ciclo_mediana_dias, anterior.ciclo_mediana_dias)} inverso />
              }
            />
            <Indicador
              rotulo={t("Receita ganha")}
              detalhe={`${ganhos.quantidade} ${t("negócios ganhos")}`}
              valor={dinheiro(ganhos.valor_cents, moeda)}
              variacao={<Variacao pct={variacao(ganhos.valor_cents, ganhosAntes.valor_cents)} />}
            />
          </ul>
        </Cartao>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fluxo do funil */}
        <Cartao
          className="lg:col-span-2"
          titulo={t("Fluxo do funil")}
          subtitulo={t("Dos negócios criados no período, quantos chegaram a cada etapa")}
          icone={<Funnel size={16} />}
        >
          {(fluxo[0]?.chegaram ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("Nenhum negócio criado no período.")}</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {fluxo.map((e) => {
                const agora = somaNaMoeda(e.agora, moeda);
                return (
                  <li
                    key={e.stage_id}
                    className={`grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-lg p-2 ${
                      e.gargalo ? "bg-warning-bg" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-medium text-text">
                        {e.nome}
                        {e.gargalo ? (
                          <span className="flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[11px] font-medium text-white">
                            <Warning size={12} />
                            {t("Gargalo")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-text-muted">
                        {e.chegaram.toLocaleString(tag)} {t("chegaram")}
                        {e.avancaram_pct != null
                          ? ` · ${e.avancaram_pct.toFixed(0)}% ${t("avançaram")}`
                          : ""}
                      </span>
                    </div>
                    <div className="row-span-2 text-right">
                      {e.ganho ? (
                        <span className="text-xs text-text-subtle">{t("etapa final")}</span>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-text">{dinheiro(agora.valor_cents, moeda, true)}</p>
                          <p className="text-xs text-text-muted">
                            {agora.quantidade.toLocaleString(tag)} {t("agora na etapa")}
                          </p>
                        </>
                      )}
                    </div>
                    <Barra pct={(e.chegaram / topoDoFluxo) * 100} cor={e.ganho ? "bg-brand-green" : "bg-accent"} />
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-3 text-xs text-text-subtle">
            {t("O gargalo só é apontado em etapa com pelo menos")} {MINIMO_DE_CASOS} {t("negócios.")}
          </p>
        </Cartao>

        {/* Ranking */}
        <Cartao titulo={t("Ranking da equipe")} subtitulo={t("Negócios ganhos no período")} icone={<Trophy size={16} />}>
          {ranking.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("Nenhum negócio ganho no período.")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {ranking.map((r, i) => (
                <li key={`${r.tipo}-${r.user_id}-${r.agent_id}`} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 text-xs text-text-subtle">{i + 1}º</span>
                      {r.tipo === "ia" ? <Robot size={14} className="shrink-0 text-accent" /> : null}
                      <span className="truncate text-text">
                        {r.tipo === "ia" ? (r.agente_nome ?? t("Agente de IA")) : nomeDo(r.user_id)}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-text">{dinheiro(r.valor_cents, moeda)}</span>
                  </div>
                  <Barra pct={(r.valor_cents / maiorDoRanking) * 100} />
                  <span className="text-xs text-text-muted">
                    {r.ganhos} {r.ganhos === 1 ? t("negócio ganho") : t("negócios ganhos")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Cartao>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo={t("Produtos vendidos")} subtitulo={t("Receita dos produtos nos negócios ganhos")} icone={<Package size={16} />}>
          {produtos.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              {t("Nenhum produto nos negócios ganhos do período.")}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {produtos.map((p) => (
                <li key={`${p.product_id ?? p.nome}`} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-text">{p.nome}</span>
                    <span className="shrink-0 font-semibold text-text">{dinheiro(p.receita_cents, moeda)}</span>
                  </div>
                  <Barra pct={(p.receita_cents / maiorProduto) * 100} cor="bg-brand-green" />
                  <span className="text-xs text-text-muted">
                    {p.quantidade} {t("un.")} · {p.negocios} {p.negocios === 1 ? t("negócio") : t("negócios")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Cartao>

        <Cartao titulo={t("Motivos de perda")} subtitulo={t("Por que os negócios foram perdidos no período")} icone={<TrendDown size={16} />}>
          {d.perdas.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("Nenhuma perda registrada no período.")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {d.perdas.map((p) => (
                <li key={p.motivo ?? "sem-motivo"} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-text">{p.motivo ?? t("Sem motivo registrado")}</span>
                    <span className="shrink-0 text-text-muted">
                      {p.quantidade} · {((p.quantidade / totalPerdas) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Barra pct={(p.quantidade / totalPerdas) * 100} cor="bg-error" />
                </li>
              ))}
            </ol>
          )}
        </Cartao>
      </div>

      <Cartao
        titulo={t("Evolução mensal")}
        subtitulo={t("Negócios criados nos últimos 12 meses, pelo status de hoje")}
        icone={<ChartLineUp size={16} />}
        acao={
          <Alternador
            rotulo={t("Medida da evolução")}
            valor={metricaMensal}
            aoMudar={setMetricaMensal}
            opcoes={[
              { valor: "valor", rotulo: t("Valor") },
              { valor: "quantidade", rotulo: t("Qtd") },
            ]}
          />
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={meses} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="mes" tickFormatter={rotuloDoMes} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
              <YAxis
                width={72}
                tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                tickFormatter={(v: number) =>
                  metricaMensal === "valor" ? dinheiro(v, moeda, true) : v.toLocaleString(tag)
                }
              />
              <Tooltip
                labelFormatter={(m) => rotuloDoMes(String(m))}
                formatter={(v) =>
                  metricaMensal === "valor" ? dinheiro(Number(v), moeda) : Number(v).toLocaleString(tag)
                }
                contentStyle={{
                  borderRadius: 8,
                  fontSize: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              />
              <Bar dataKey="won" name={t("Ganhos")} stackId="s" fill="var(--color-brand-green)" />
              <Bar dataKey="open" name={t("Em aberto")} stackId="s" fill="var(--color-accent-400)" />
              <Bar dataKey="lost" name={t("Perdidos")} stackId="s" fill="var(--color-error)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Cartao>

      <Cartao
        titulo={t("Negócios esfriando")}
        subtitulo={t("Os abertos parados há mais tempo na mesma etapa")}
        icone={<Snowflake size={16} />}
        acao={
          <Link href="/app/kanban" className="text-xs font-medium text-accent hover:underline">
            {t("Abrir o Kanban")}
          </Link>
        }
      >
        {d.parados.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">{t("Nenhum negócio em aberto neste funil.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.parados.map((p) => {
              const n = dias(p.na_etapa_desde);
              return (
                <li key={p.lead_id}>
                  <Link
                    href={`/app/leads/${p.lead_id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 hover:bg-surface-elevated sm:grid-cols-[2fr_1fr_1fr_auto]"
                  >
                    <span className="truncate text-sm font-medium text-text">{p.titulo}</span>
                    <span className="hidden truncate text-xs text-text-muted sm:block">{p.etapa ?? "—"}</span>
                    <span className="hidden truncate text-xs text-text-muted sm:block">
                      {p.owner_user_id ? nomeDo(p.owner_user_id) : t("Sem responsável")}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-warning-fg">
                      <Clock size={12} />
                      {n} {n === 1 ? t("dia") : t("dias")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <details className="rounded-xl border border-border bg-surface p-4 text-xs text-text-muted">
        <summary className="flex cursor-pointer items-center gap-2 font-medium text-text">
          <ChartBar size={14} />
          {t("Como estes números foram contados")}
        </summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>{t("Ganho e perdido contam pela data de fechamento dentro do período. Em aberto é a carteira de agora.")}</li>
          <li>{t("A comparação é contra o período anterior de mesma duração.")}</li>
          <li>{t("Taxa de conversão é ganhos sobre fechados (ganhos + perdidos). Sem negócio fechado, aparece “—”.")}</li>
          <li>{t("Ciclo de vendas é a mediana entre a criação e o ganho, para um negócio esquecido não distorcer a conta.")}</li>
          <li>{t("Fluxo do funil: um negócio conta como tendo chegado a todas as etapas até a atual (ou até aquela em que foi perdido). Quem foi criado no meio do funil conta as anteriores.")}</li>
          <li>{t("Negócio transferido para outro funil não conta como perda.")}</li>
          <li>{t("Valores em moedas diferentes nunca são somados.")}</li>
          {!podeComparar ? <li>{t("Você vê apenas os negócios que pode ver no CRM.")}</li> : null}
        </ul>
      </details>
    </div>
  );
}

function Filtro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
      {rotulo}
      {children}
    </label>
  );
}

function Indicador({
  rotulo,
  detalhe,
  valor,
  variacao: comparacao,
}: {
  rotulo: string;
  detalhe: string;
  valor: string;
  variacao: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm text-text">{rotulo}</p>
        <p className="text-xs text-text-subtle">{detalhe}</p>
        <div className="mt-0.5">{comparacao}</div>
      </div>
      <p className="shrink-0 text-lg font-semibold text-text">{valor}</p>
    </li>
  );
}
