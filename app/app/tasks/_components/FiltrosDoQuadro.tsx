"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { contarFiltros, type FiltroDoQuadro, type PeriodoDoPrazo } from "@/lib/tarefas/quadro";
import { PRIORIDADES_DA_TAREFA, type PrioridadeDaTarefa } from "@/lib/tarefas/tipos";
import { FadersHorizontal, UserCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Pessoa {
  user_id: string;
  full_name: string | null;
}

const chip = (ativo: boolean) =>
  cn("h-7 px-2.5 text-xs", ativo && "border-accent bg-accent/10 text-accent hover:bg-accent/15");

/** "Minhas tarefas" (alternância) + "Filtro" (prazo, prioridade, responsável), combináveis. */
export function FiltrosDoQuadro({
  filtro,
  onChange,
  pessoas,
  usuarioId,
}: {
  filtro: FiltroDoQuadro;
  onChange: (f: FiltroDoQuadro) => void;
  pessoas: Pessoa[];
  usuarioId: string;
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const ativos = contarFiltros(filtro);

  const periodos: Array<{ valor: PeriodoDoPrazo; rotulo: string }> = [
    { valor: "atrasadas", rotulo: t("Atrasadas") },
    { valor: "hoje", rotulo: t("Hoje") },
    { valor: "semana", rotulo: t("Esta semana") },
    { valor: "personalizado", rotulo: t("Personalizado") },
  ];
  const rotuloDaPrioridade: Record<PrioridadeDaTarefa, string> = {
    low: t("Baixa"),
    medium: t("Média"),
    high: t("Alta"),
    urgent: t("Urgente"),
  };
  const alterna = <T,>(lista: T[] | undefined, v: T): T[] | undefined => {
    const proxima = lista?.includes(v) ? lista.filter((x) => x !== v) : [...(lista ?? []), v];
    return proxima.length ? proxima : undefined;
  };
  const visiveis = pessoas
    .filter((p) => (p.full_name ?? "").toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR"));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={!!filtro.minhas}
        data-testid="minhas-tarefas"
        className={cn(
          "h-9 gap-1.5 text-xs",
          filtro.minhas && "border-accent bg-accent/10 text-accent",
        )}
        onClick={() => onChange({ ...filtro, minhas: filtro.minhas ? undefined : true })}
      >
        <UserCircle size={14} aria-hidden />
        {t("Minhas tarefas")}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="botao-filtro-tarefas"
            className={cn("h-9 gap-1.5 text-xs", ativos > 0 && "border-accent text-accent")}
          >
            <FadersHorizontal size={14} aria-hidden />
            {t("Filtro")}
            {ativos > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                {ativos}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[min(75dvh,600px)] w-[min(92vw,340px)] space-y-4 overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{t("Filtro")}</p>
            {ativos > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange({ minhas: filtro.minhas })}
              >
                {t("Limpar filtros")}
              </Button>
            )}
          </div>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground">{t("Prazo")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {periodos.map((p) => (
                <Button
                  key={p.valor}
                  variant="outline"
                  size="sm"
                  aria-pressed={filtro.prazo === p.valor}
                  className={chip(filtro.prazo === p.valor)}
                  onClick={() =>
                    onChange({
                      ...filtro,
                      prazo: filtro.prazo === p.valor ? undefined : p.valor,
                      de: undefined,
                      ate: undefined,
                    })
                  }
                >
                  {p.rotulo}
                </Button>
              ))}
            </div>
            {filtro.prazo === "personalizado" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  aria-label={`${t("Prazo")}: ${t("de")}`}
                  value={filtro.de ?? ""}
                  max={filtro.ate}
                  onChange={(e) => onChange({ ...filtro, de: e.target.value || undefined })}
                  className="h-8 text-xs"
                />
                <Input
                  type="date"
                  aria-label={`${t("Prazo")}: ${t("até")}`}
                  value={filtro.ate ?? ""}
                  min={filtro.de}
                  onChange={(e) => onChange({ ...filtro, ate: e.target.value || undefined })}
                  className="h-8 text-xs"
                />
              </div>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground">{t("Prioridade")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {PRIORIDADES_DA_TAREFA.map((p) => {
                const ativa = !!filtro.prioridades?.includes(p);
                return (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    aria-pressed={ativa}
                    className={chip(ativa)}
                    onClick={() =>
                      onChange({ ...filtro, prioridades: alterna(filtro.prioridades, p) })
                    }
                  >
                    {rotuloDaPrioridade[p]}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground">{t("Responsável")}</h3>
            <Input
              type="search"
              value={busca}
              placeholder={t("Buscar pessoa…")}
              aria-label={t("Buscar responsável")}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {visiveis.map((p) => {
                const marcado = !!filtro.responsaveis?.includes(p.user_id);
                return (
                  <label
                    key={p.user_id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() =>
                        onChange({
                          ...filtro,
                          responsaveis: alterna(filtro.responsaveis, p.user_id),
                        })
                      }
                    />
                    <span className="truncate">
                      {p.user_id === usuarioId ? t("Eu") : (p.full_name ?? t("Sem nome"))}
                    </span>
                  </label>
                );
              })}
              {visiveis.length === 0 && (
                <p className="px-1.5 py-1 text-xs text-muted-foreground">
                  {t("Ninguém encontrado.")}
                </p>
              )}
            </div>
          </section>
        </PopoverContent>
      </Popover>
    </div>
  );
}
