"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { aiExtractFieldSchema } from "@/lib/followup/graph-schema";
import { Plus, Trash } from "@/lib/ui/icons";

import { InserirVariavel, inserirNoCursor } from "../VariaveisDoFluxo";
import type { ConfigOf } from "./shared";

type Campo = ConfigOf<"ai_extract">["fields"][number];

/**
 * Extrair dados por IA (Fase 5): o texto a ler (vazio = a última mensagem do cliente) e os campos, cada um com tipo e
 * uma descrição para a IA. A saída é conferida pelo tipo; o que não confere fica vazio, nunca inventado.
 */
export function AiExtractForm({
  config,
  onChange,
}: {
  config: ConfigOf<"ai_extract">;
  onChange: (c: ConfigOf<"ai_extract">) => void;
}) {
  const t = useT();
  const fonte = useRef<HTMLTextAreaElement>(null);
  const trocar = (i: number, campo: Partial<Campo>) =>
    onChange({ ...config, fields: config.fields.map((f, j) => (j === i ? { ...f, ...campo } : f)) });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="extrair-fonte">{t("Texto a ler")}</Label>
        <InserirVariavel
          soBlocos
          onInserir={(m) => onChange({ ...config, fonte: inserirNoCursor(fonte.current, config.fonte, m) })}
        />
      </div>
      <Textarea
        id="extrair-fonte"
        ref={fonte}
        value={config.fonte}
        maxLength={4000}
        rows={3}
        placeholder={t("Vazio = a última mensagem do cliente")}
        onChange={(e) => onChange({ ...config, fonte: e.target.value })}
      />
      {config.fields.map((f, i) => {
        const nomeOk = aiExtractFieldSchema.shape.name.safeParse(f.name).success;
        return (
          <fieldset key={i} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`extrair-nome-${i}`}>{t("Nome do campo")}</Label>
                <Input
                  id={`extrair-nome-${i}`}
                  value={f.name}
                  placeholder="cidade"
                  aria-invalid={!nomeOk}
                  onChange={(e) => trocar(i, { name: e.target.value.trim().toLowerCase() })}
                />
              </div>
              <div className="w-28">
                <Label htmlFor={`extrair-tipo-${i}`}>{t("Tipo")}</Label>
                <Select value={f.type} onValueChange={(v) => trocar(i, { type: v as Campo["type"] })}>
                  <SelectTrigger id={`extrair-tipo-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Literais por ramo (cerca de i18n): os rótulos são os de `TIPOS_DO_CAMPO_DO_MAPA` (vocabulario.ts). */}
                    <SelectItem value="text">{t("Texto")}</SelectItem>
                    <SelectItem value="number">{t("Número")}</SelectItem>
                    <SelectItem value="boolean">{t("Sim/não")}</SelectItem>
                    <SelectItem value="list">{t("Lista")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Remover campo")}
                onClick={() => onChange({ ...config, fields: config.fields.filter((_, j) => j !== i) })}
              >
                <Trash size={14} />
              </Button>
            </div>
            {!nomeOk && <p className="text-xs text-error-fg">{t("Use letras minúsculas, números e _ (começando por letra).")}</p>}
            <Label htmlFor={`extrair-desc-${i}`}>{t("O que a IA deve procurar")}</Label>
            <Input
              id={`extrair-desc-${i}`}
              value={f.descricao}
              maxLength={300}
              placeholder={t("ex.: a cidade onde o cliente mora")}
              onChange={(e) => trocar(i, { descricao: e.target.value })}
            />
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={config.fields.length >= 20}
        onClick={() =>
          onChange({ ...config, fields: [...config.fields, { name: `campo_${config.fields.length + 1}`, type: "text", descricao: "" }] })
        }
      >
        <Plus size={14} /> {t("Acrescentar campo")}
      </Button>
      <Label htmlFor="extrair-dica">{t("Orientação para a IA (opcional)")}</Label>
      <Textarea
        id="extrair-dica"
        value={config.dica}
        maxLength={1000}
        rows={2}
        onChange={(e) => onChange({ ...config, dica: e.target.value })}
      />
      <p className="text-xs text-text-muted">
        {t("Cada execução que passa por aqui faz uma chamada de IA, contada no consumo da organização. O que a IA não achar fica vazio.")}
      </p>
    </div>
  );
}
