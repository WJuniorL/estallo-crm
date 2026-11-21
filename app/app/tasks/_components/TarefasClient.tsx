"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useTasks } from "@/hooks/tasks/useTasks";
import {
  filtrarTarefas,
  filtroDaUrl,
  filtroParaUrl,
  type FiltroDoQuadro,
} from "@/lib/tarefas/quadro";
import type { NovaTarefa, Tarefa } from "@/lib/tarefas/tipos";
import { ArrowsClockwise, CalendarBlank, Kanban, Plus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CalendarioDeTarefas } from "./CalendarioDeTarefas";
import { FiltrosDoQuadro } from "./FiltrosDoQuadro";
import { FormularioDeTarefa } from "./FormularioDeTarefa";
import { QuadroDeTarefas } from "./QuadroDeTarefas";

/**
 * TAREFAS: o quadro (uma coluna por situação) e o calendário, com os MESMOS
 * filtros nas duas visões. Os dados vêm de `useTasks`, a mesma chave
 * (`crm_tasks`) que o dossiê do lead usa: mudar a situação lá, no modal ou pelo
 * arraste aqui atualiza todas as listas em cache, sem recarregar a página.
 */
export function TarefasClient({ podeEditar }: { podeEditar: boolean }) {
  const t = useT();
  const usuario = useUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtro = useMemo(
    () => filtroDaUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const modo = searchParams.get("visao") === "calendario" ? "calendario" : "quadro";
  const escrever = useCallback(
    (f: FiltroDoQuadro, visao: "quadro" | "calendario") => {
      const p = new URLSearchParams(filtroParaUrl(f));
      if (visao === "calendario") p.set("visao", "calendario");
      const qs = p.toString();
      // History API, como o filtro do funil: sem ida ao servidor a cada clique.
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );

  const [emEdicao, setEmEdicao] = useState<Tarefa | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [prazoSugerido, setPrazoSugerido] = useState<string | undefined>();
  // A CHAVE DE REMONTAGEM do formulário. Ele lê o estado inicial das props
  // (nada de `useEffect` sincronizando), então abrir duas vezes seguidas o
  // "Nova tarefa" precisa de uma chave NOVA — senão a segunda abertura traz o
  // que ficou digitado na primeira.
  const [aberturas, setAberturas] = useState(0);

  // TODAS as situações: cada uma tem sua coluna.
  const {
    tarefas,
    carregando,
    falhou,
    recarregar,
    criarTarefa,
    editarTarefa,
    apagarTarefa,
    mudarSituacao,
  } = useTasks();
  const visiveis = useMemo(
    () => filtrarTarefas(tarefas, filtro, { usuarioId: usuario.id }),
    [tarefas, filtro, usuario.id],
  );

  // Os nomes vêm da lista de responsáveis, que é `agent`+ na rota: para quem só
  // lê, a consulta nem sai e o card fica sem o nome — nunca com um id cru.
  const membros = useAssignableMembers(podeEditar);
  const nomes = useMemo(
    () => new Map((membros.data ?? []).map((m) => [m.user_id, m.full_name])),
    [membros.data],
  );
  const nomeDoResponsavel = (tarefa: Tarefa): string | null => {
    if (!tarefa.assigned_to) return null;
    if (tarefa.assigned_to === usuario.id) return t("Eu");
    return nomes.get(tarefa.assigned_to) ?? null;
  };

  function abrirNova(dia?: string) {
    setEmEdicao(null);
    setPrazoSugerido(dia);
    setAberturas((n) => n + 1);
    setFormAberto(true);
  }

  function abrirEdicao(tarefa: Tarefa) {
    setEmEdicao(tarefa);
    setPrazoSugerido(undefined);
    setAberturas((n) => n + 1);
    setFormAberto(true);
  }

  async function salvar(entrada: NovaTarefa) {
    if (!emEdicao) return criarTarefa(entrada);
    // OTIMISTA: o modal fecha na hora e o card já mostra a mudança; se o
    // servidor recusar, a lista se desfaz sozinha e o aviso diz por quê.
    editarTarefa(emEdicao.id, entrada).catch((erro: unknown) =>
      toast.error(t("Não foi possível salvar a tarefa."), {
        description: erro instanceof Error ? erro.message : undefined,
      }),
    );
  }

  const alternaVisao = (visao: "quadro" | "calendario") => escrever(filtro, visao);
  const botaoDeVisao = (visao: "quadro" | "calendario", rotulo: string, Icone: typeof Kanban) => (
    <button
      type="button"
      onClick={() => alternaVisao(visao)}
      aria-pressed={modo === visao}
      aria-label={rotulo}
      title={rotulo}
      data-testid={`visao-${visao}`}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        modo === visao
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icone size={14} aria-hidden />
      <span className="hidden lg:inline">{rotulo}</span>
    </button>
  );

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4",
        // O QUADRO CABE NA TELA, como o do funil: quem rola é ele, a barra
        // horizontal fica no pé e o título de cada coluna fica preso em cima.
        // Mesma fórmula de `app/app/pipelines/[id]/_client.tsx` (lê a reserva do
        // rodápé — `tests/unit/altura-fixa-le-a-reserva-do-rodape.test.ts`).
        modo === "quadro" &&
          "h-[calc(100dvh-3.5rem-var(--space-6)-max(var(--space-6),var(--rodape-ocupado,0px)))] min-h-[28rem]",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="shrink-0 text-2xl font-semibold tracking-tight">{t("Tarefas")}</h1>

        {/* Uma linha só a partir do tablet, com "Nova tarefa" sempre por último;
            os rótulos secundários viram só ícone quando o espaço aperta. */}
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <FiltrosDoQuadro
            filtro={filtro}
            onChange={(f) => escrever(f, modo)}
            pessoas={membros.data ?? []}
            usuarioId={usuario.id}
          />

          <div className="flex items-center gap-0.5 rounded-md border bg-muted p-0.5">
            {botaoDeVisao("quadro", t("Quadro"), Kanban)}
            {botaoDeVisao("calendario", t("Calendário"), CalendarBlank)}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => recarregar()}
            disabled={carregando}
            aria-label={t("Atualizar")}
            title={t("Atualizar")}
          >
            <ArrowsClockwise size={14} className={cn(carregando && "animate-spin")} aria-hidden />
            <span className="hidden xl:inline">{t("Atualizar")}</span>
          </Button>

          {podeEditar && (
            <Button size="sm" className="h-9 shrink-0 gap-1.5 text-xs" onClick={() => abrirNova()}>
              <Plus size={14} aria-hidden />
              {t("Nova tarefa")}
            </Button>
          )}
        </div>
      </div>

      {falhou ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            {t("Não foi possível carregar as tarefas.")}
          </p>
          <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => recarregar()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      ) : carregando ? (
        <div className="flex gap-3 overflow-hidden" aria-busy>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 w-[300px] shrink-0 animate-pulse rounded-2xl border bg-card md:w-auto md:flex-1"
            />
          ))}
        </div>
      ) : tarefas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm font-medium">{t("Nenhuma tarefa por aqui")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Enquanto isto estiver vazio, o que foi combinado vive só na memória de alguém.")}
          </p>
          {podeEditar && (
            <Button size="sm" className="mt-4 gap-1.5 text-xs" onClick={() => abrirNova()}>
              <Plus size={14} aria-hidden />
              {t("Nova tarefa")}
            </Button>
          )}
        </div>
      ) : modo === "calendario" ? (
        <CalendarioDeTarefas
          tarefas={visiveis}
          podeEditar={podeEditar}
          aoAbrirTarefa={abrirEdicao}
          aoClicarNoDia={abrirNova}
        />
      ) : (
        <QuadroDeTarefas
          tarefas={visiveis}
          podeEditar={podeEditar}
          nomeDoResponsavel={nomeDoResponsavel}
          aoMover={mudarSituacao}
          aoEditar={abrirEdicao}
          aoApagar={(tarefa) => apagarTarefa(tarefa.id)}
        />
      )}

      <FormularioDeTarefa
        key={aberturas}
        aberto={formAberto}
        aoMudarAbertura={setFormAberto}
        tarefa={emEdicao}
        prazoSugerido={prazoSugerido}
        aoSalvar={salvar}
      />
    </div>
  );
}
