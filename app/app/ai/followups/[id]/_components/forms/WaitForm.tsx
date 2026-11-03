"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { waitConfigSchema } from "@/lib/followup/graph-schema";
import { MODOS_DE_ESPERA, opcoes } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";

import {
  msToMin,
  minToMs,
  msParaValorEUnidade,
  valorEUnidadeParaMs,
  UNIDADES_DE_TEMPO,
  type ConfigOf,
  type UnidadeDeTempo,
} from "./shared";

const ROTULO_DA_UNIDADE: Record<UnidadeDeTempo, string> = {
  segundos: "Segundos",
  minutos: "Minutos",
  horas: "Horas",
  dias: "Dias",
};

export function WaitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"wait">;
  onChange: (c: ConfigOf<"wait">) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"fixed" | "smart">(config.mode);
  const inicial = msParaValorEUnidade(config.mode === "fixed" ? config.duration_ms : 600_000);
  const [duracao, setDuracao] = useState(inicial.valor);
  const [unidade, setUnidade] = useState<UnidadeDeTempo>(inicial.unidade);
  const [minMin, setMinMin] = useState(config.mode === "smart" ? msToMin(config.min_ms) : 5);
  const [maxMin, setMaxMin] = useState(config.mode === "smart" ? msToMin(config.max_ms) : 60);
  const [guidance, setGuidance] = useState(config.mode === "smart" ? (config.guidance ?? "") : "");
  const [error, setError] = useState<string | null>(null);

  const commit = (next: {
    mode: "fixed" | "smart";
    duracao: number;
    unidade: UnidadeDeTempo;
    minMin: number;
    maxMin: number;
    guidance: string;
  }) => {
    const candidate =
      next.mode === "fixed"
        ? { mode: "fixed" as const, duration_ms: valorEUnidadeParaMs(next.duracao, next.unidade) }
        : {
            mode: "smart" as const,
            min_ms: minToMs(next.minMin),
            max_ms: minToMs(next.maxMin),
            ...(next.guidance.trim() ? { guidance: next.guidance } : {}),
          };
    const parsed = waitConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="wait-mode">{t("Como calcular a espera")}</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as "fixed" | "smart";
            setMode(next);
            commit({ mode: next, duracao, unidade, minMin, maxMin, guidance });
          }}
        >
          <SelectTrigger id="wait-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes(MODOS_DE_ESPERA).map(({ valor, rotulo }) => (
              <SelectItem key={valor} value={valor}>
                {t(rotulo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "fixed" ? (
        <div className="space-y-2">
          <Label htmlFor="wait-duration">{t("Esperar")}</Label>
          <div className="flex gap-2">
            <Input
              id="wait-duration"
              type="number"
              min={1}
              value={duracao}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDuracao(v);
                commit({ mode, duracao: v, unidade, minMin, maxMin, guidance });
              }}
            />
            <Select
              value={unidade}
              onValueChange={(v) => {
                const u = v as UnidadeDeTempo;
                setUnidade(u);
                commit({ mode, duracao, unidade: u, minMin, maxMin, guidance });
              }}
            >
              <SelectTrigger aria-label={t("Unidade de tempo")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES_DE_TEMPO.slice()
                  .reverse()
                  .map(({ unidade: u }) => (
                    <SelectItem key={u} value={u}>
                      {t(ROTULO_DA_UNIDADE[u])}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wait-min">{t("Mínimo (min)")}</Label>
              <Input
                id="wait-min"
                type="number"
                min={5}
                value={minMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMinMin(v);
                  commit({ mode, duracao, unidade, minMin: v, maxMin, guidance });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wait-max">{t("Máximo (min)")}</Label>
              <Input
                id="wait-max"
                type="number"
                min={5}
                value={maxMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxMin(v);
                  commit({ mode, duracao, unidade, minMin, maxMin: v, guidance });
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wait-guidance">{t("Orientação (opcional)")}</Label>
            <Textarea
              id="wait-guidance"
              maxLength={500}
              value={guidance}
              onChange={(e) => {
                setGuidance(e.target.value);
                commit({ mode, duracao, unidade, minMin, maxMin, guidance: e.target.value });
              }}
            />
          </div>
        </>
      )}
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
