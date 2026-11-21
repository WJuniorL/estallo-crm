"use client";
import { useState } from "react";

import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ORDENACOES_DO_FUNIL,
  ROTULO_DA_ORDENACAO,
  type OrdenacaoDoFunil,
} from "@/lib/kanban/ordenacao";
import { ArrowsDownUp } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import type { FiltroDeCampo, LeadFilters } from "@/lib/kanban/filters";
import { cn } from "@/lib/utils";

/** "Ordenação": a ordem dos cards em cada etapa. Fica na URL (`ordem=`), como os filtros. */
export function MenuDeOrdenacao({
  ordem,
  onChange,
}: {
  ordem: OrdenacaoDoFunil;
  onChange: (o: OrdenacaoDoFunil) => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="botao-ordenacao">
          <ArrowsDownUp size={14} className="mr-1.5" aria-hidden />
          {t(ROTULO_DA_ORDENACAO[ordem])}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <ArrowsDownUp size={14} aria-hidden /> {t("Ordenação")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={ordem}
          onValueChange={(v) => onChange(v as OrdenacaoDoFunil)}
        >
          {ORDENACOES_DO_FUNIL.map((o) => (
            <DropdownMenuRadioItem key={o} value={o}>
              {t(ROTULO_DA_ORDENACAO[o])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {ordem !== "manual" && (
          <p className="px-2 py-1.5 text-[11px] leading-4 text-text-muted">
            {t("Arrastar muda a etapa. Reordenar dentro da etapa só no modo Manual.")}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Um bloco rotulado dentro do painel de filtros. */
export function SecaoDeFiltro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold text-text-muted">{titulo}</h3>
      {children}
    </section>
  );
}

/** De/até com o `<input type="date">` nativo — o calendário do sistema, sem biblioteca. */
export function IntervaloDeDatas({
  rotulo,
  de,
  ate,
  onChange,
  testId,
}: {
  rotulo: string;
  de?: string;
  ate?: string;
  onChange: (de: string | undefined, ate: string | undefined) => void;
  testId: string;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-2" data-testid={testId}>
      <Input
        type="date"
        aria-label={`${rotulo}: ${t("de")}`}
        value={de ?? ""}
        max={ate}
        onChange={(e) => onChange(e.target.value || undefined, ate)}
        className="h-8 text-xs"
      />
      <Input
        type="date"
        aria-label={`${rotulo}: ${t("até")}`}
        value={ate ?? ""}
        min={de}
        onChange={(e) => onChange(de, e.target.value || undefined)}
        className="h-8 text-xs"
      />
    </div>
  );
}

const TEXTO = new Set(["text", "textarea", "email", "phone", "url"]);
const NUMERO = new Set(["number", "currency"]);

/**
 * Filtro por campo personalizado: escolhe o campo do funil e a condição muda
 * com o tipo dele. Os campos já escolhidos ficam listados, cada um removível.
 */
export function FiltroDeCamposPersonalizados({
  campos,
  filters,
  onChange,
}: {
  campos: CustomFieldDef[];
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
}) {
  const t = useT();
  const atuais = filters.campos ?? {};
  const [escolhido, setEscolhido] = useState("");
  const livres = campos.filter((c) => !(c.key in atuais));

  const definir = (key: string, c: FiltroDeCampo | null) => {
    const proximo = { ...atuais };
    if (c) proximo[key] = c;
    else delete proximo[key];
    onChange({ ...filters, campos: Object.keys(proximo).length ? proximo : undefined });
  };

  if (campos.length === 0) {
    return (
      <p className="text-xs text-text-muted">{t("Este funil não tem campos personalizados.")}</p>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(atuais).map(([key, c]) => {
        const def = campos.find((d) => d.key === key);
        if (!def) return null;
        return (
          <div key={key} className="space-y-1 rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{def.label}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => definir(key, null)}
              >
                {t("Remover")}
              </Button>
            </div>
            <CondicaoDoCampo def={def} valor={c} onChange={(v) => definir(key, v)} />
          </div>
        );
      })}
      {livres.length > 0 && (
        <select
          aria-label={t("Adicionar campo ao filtro")}
          value={escolhido}
          onChange={(e) => {
            const key = e.target.value;
            setEscolhido("");
            if (key) definir(key, {});
          }}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">{t("+ Filtrar por um campo…")}</option>
          {livres.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CondicaoDoCampo({
  def,
  valor,
  onChange,
}: {
  def: CustomFieldDef;
  valor: FiltroDeCampo;
  onChange: (v: FiltroDeCampo) => void;
}) {
  const t = useT();
  if (TEXTO.has(def.type)) {
    return (
      <Input
        value={valor.contem ?? ""}
        placeholder={t("Contém…")}
        aria-label={`${def.label}: ${t("contém")}`}
        onChange={(e) => onChange({ contem: e.target.value })}
        className="h-8 text-xs"
      />
    );
  }
  if (NUMERO.has(def.type)) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          placeholder={t("Mínimo")}
          aria-label={`${def.label}: ${t("mínimo")}`}
          value={valor.de ?? ""}
          onChange={(e) => onChange({ ...valor, de: e.target.value || undefined })}
          className="h-8 text-xs"
        />
        <Input
          type="number"
          placeholder={t("Máximo")}
          aria-label={`${def.label}: ${t("máximo")}`}
          value={valor.ate ?? ""}
          onChange={(e) => onChange({ ...valor, ate: e.target.value || undefined })}
          className="h-8 text-xs"
        />
      </div>
    );
  }
  if (def.type === "date") {
    return (
      <IntervaloDeDatas
        rotulo={def.label}
        de={valor.de}
        ate={valor.ate}
        onChange={(de, ate) => onChange({ de, ate })}
        testId={`filtro-campo-${def.key}`}
      />
    );
  }
  if (def.type === "boolean") {
    return (
      <div className="flex gap-1.5">
        {[
          { v: true, rotulo: t("Sim") },
          { v: false, rotulo: t("Não") },
        ].map((o) => (
          <Button
            key={o.rotulo}
            size="sm"
            variant="outline"
            aria-pressed={valor.booleano === o.v}
            className={cn(
              "h-7 flex-1 text-xs",
              valor.booleano === o.v && "border-accent bg-accent/10",
            )}
            onClick={() => onChange({ booleano: valor.booleano === o.v ? undefined : o.v })}
          >
            {o.rotulo}
          </Button>
        ))}
      </div>
    );
  }
  // select / multiselect: uma ou mais opções (casa se tiver QUALQUER uma).
  const escolhidas = valor.opcoes ?? [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {(def.options ?? []).map((o) => {
        const marcada = escolhidas.includes(o.value);
        return (
          <Button
            key={o.value}
            size="sm"
            variant="outline"
            aria-pressed={marcada}
            className={cn("h-7 text-xs", marcada && "border-accent bg-accent/10")}
            onClick={() =>
              onChange({
                opcoes: marcada
                  ? escolhidas.filter((v) => v !== o.value)
                  : [...escolhidas, o.value],
              })
            }
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
