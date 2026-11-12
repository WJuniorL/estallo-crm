"use client";

import { useRef } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { DESTINOS_DA_NOTA } from "@/lib/followup/vocabulario";

import { InserirVariavel, inserirNoCursor, PreviaDoTexto } from "../VariaveisDoFluxo";
import type { ConfigOf } from "./shared";

/** Nota interna (Fase 5): destino escolhido explicitamente e texto com variáveis dos blocos anteriores. */
export function AddNoteForm({
  config,
  onChange,
}: {
  config: ConfigOf<"add_note">;
  onChange: (c: ConfigOf<"add_note">) => void;
}) {
  const t = useT();
  const campo = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="space-y-2">
      <Label htmlFor="add-note-destino">{t("Onde registrar")}</Label>
      <Select
        value={config.destino}
        onValueChange={(v) => onChange({ ...config, destino: v === "conversa" ? "conversa" : "negocio" })}
      >
        <SelectTrigger id="add-note-destino">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(DESTINOS_DA_NOTA) as Array<[keyof typeof DESTINOS_DA_NOTA, string]>).map(([v, r]) => (
            <SelectItem key={v} value={v}>
              {t(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="add-note-texto">{t("Texto da nota")}</Label>
        <InserirVariavel
          soBlocos
          onInserir={(marca) => onChange({ ...config, texto: inserirNoCursor(campo.current, config.texto, marca) })}
        />
      </div>
      <Textarea
        id="add-note-texto"
        ref={campo}
        value={config.texto}
        maxLength={2000}
        aria-invalid={!config.texto.trim()}
        onChange={(e) => onChange({ ...config, texto: e.target.value })}
      />
      <PreviaDoTexto texto={config.texto} />
      <p className="text-xs text-text-muted">{t("A nota é interna: o cliente nunca a vê.")}</p>
    </div>
  );
}
