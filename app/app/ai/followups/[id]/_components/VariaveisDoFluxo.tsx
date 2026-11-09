"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { previaDoTexto } from "@/lib/followup/previa-do-texto";
import { ancestrais, CAMPOS_DE_SAIDA } from "@/lib/followup/variaveis-de-blocos";
import { useT } from "@/hooks/i18n/useT";

/** O fluxo como está AGORA no construtor e qual bloco está aberto no painel — é o que define as variáveis disponíveis. */
interface Estado {
  grafo: Pick<FlowGraph, "nodes" | "edges"> | null;
  noId: string | null;
}

const Contexto = createContext<Estado>({ grafo: null, noId: null });

export function VariaveisDoFluxoProvider({ grafo, noId, children }: Estado & { children: ReactNode }) {
  const valor = useMemo(() => ({ grafo, noId }), [grafo, noId]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export interface VariavelOferecida {
  /** O que entra no texto. */
  marca: string;
  rotulo: string;
}
export interface GrupoDeVariaveis {
  rotulo: string;
  itens: VariavelOferecida[];
}

/** Os dados de quem recebe: valem em qualquer bloco, sem depender do caminho. */
const DO_CONTATO: VariavelOferecida[] = [
  { marca: "{{nome}}", rotulo: "Nome" },
  { marca: "{{primeiro_nome}}", rotulo: "Primeiro nome" },
  { marca: "{{telefone}}", rotulo: "Telefone" },
  { marca: "{{email}}", rotulo: "E-mail" },
  { marca: "{{lead.title}}", rotulo: "Título do negócio" },
];

/**
 * As variáveis que o bloco aberto pode usar: os dados do contato e, de cada bloco que vem ANTES dele no caminho, os
 * campos de saída que o bloco declara. O nome mostrado é o que a pessoa deu ao bloco; a marca leva o id (estável).
 */
export function gruposDeVariaveis(grafo: Estado["grafo"], noId: string | null): GrupoDeVariaveis[] {
  const grupos: GrupoDeVariaveis[] = [{ rotulo: "Contato e negócio", itens: DO_CONTATO }];
  if (!grafo || !noId) return grupos;
  const anteriores = ancestrais(grafo, noId);
  for (const no of grafo.nodes) {
    if (!anteriores.has(no.id)) continue;
    const campos = CAMPOS_DE_SAIDA[no.type];
    if (!campos || campos.length === 0) continue;
    grupos.push({
      rotulo: no.label,
      itens: campos.map((c) => ({ marca: `{{nodes.${no.id}.${c.caminho}}}`, rotulo: c.rotulo })),
    });
  }
  return grupos;
}

/**
 * "Inserir variável": lista os dados do contato e as saídas dos blocos anteriores, e devolve a marca pronta.
 * Quem usa decide ONDE ela entra no texto (no cursor).
 */
export function InserirVariavel({ onInserir }: { onInserir: (marca: string) => void }) {
  const t = useT();
  const { grafo, noId } = useContext(Contexto);
  const grupos = useMemo(() => gruposDeVariaveis(grafo, noId), [grafo, noId]);

  return (
    // `value=""` mantém o seletor sempre em "Inserir variável": ele é um menu de ações, não um campo com valor.
    <Select value="" onValueChange={(marca) => marca && onInserir(marca)}>
      <SelectTrigger aria-label={t("Inserir variável")} className="h-8 w-auto gap-1 text-xs" data-testid="inserir-variavel">
        <SelectValue placeholder={t("Inserir variável")} />
      </SelectTrigger>
      <SelectContent>
        {grupos.map((g) => (
          <SelectGroup key={g.rotulo}>
            <SelectLabel>{t(g.rotulo)}</SelectLabel>
            {g.itens.map((i) => (
              <SelectItem key={i.marca} value={i.marca}>
                {t(i.rotulo)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Insere `marca` no cursor de um campo de texto (ou no fim, sem foco) e devolve o texto novo. */
export function inserirNoCursor(campo: HTMLTextAreaElement | null, texto: string, marca: string): string {
  const inicio = campo?.selectionStart ?? texto.length;
  const fim = campo?.selectionEnd ?? texto.length;
  return texto.slice(0, inicio) + marca + texto.slice(fim);
}

/**
 * «Como vai sair»: o texto com uma amostra EXPLÍCITA (contato e saídas de exemplo). Não é dado de cliente nem de
 * execução — o rótulo diz isso. Só aparece quando o texto tem variável: sem ela a prévia seria o próprio campo.
 */
export function PreviaDoTexto({ texto }: { texto: string }) {
  const t = useT();
  const { grafo, noId } = useContext(Contexto);
  const previa = useMemo(() => previaDoTexto(texto, grafo, noId), [texto, grafo, noId]);
  if (!/\{\{[^}]+\}\}/.test(texto)) return null;
  return (
    <div className="rounded-sm border border-dashed border-border p-2 text-xs" data-testid="previa-do-texto">
      <p className="mb-1 font-medium text-text-muted">{t("Como vai sair (exemplo simulado)")}</p>
      <p className="whitespace-pre-wrap">{previa.texto}</p>
      {previa.sem_valor.length > 0 && (
        <p className="mt-1 text-warning-fg" data-testid="previa-sem-valor">
          {t("Ficaria sem valor com este exemplo:")} {previa.sem_valor.join(", ")}
        </p>
      )}
    </div>
  );
}
