"use client";

import { useState } from "react";

import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { useEtiquetasDaEntidade } from "@/components/tags/CoresDasEtiquetas";
import { PontoDaEtiqueta } from "@/components/tags/PontoDaEtiqueta";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import type { EntidadeDaEtiqueta } from "@/lib/tags/cor-da-etiqueta";
import { Plus, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const MAXIMO = 20;

/**
 * Atribuir etiquetas a um contato ou a uma oportunidade (Estallo, 0659): o campo
 * oferece as etiquetas CADASTRADAS daquela entidade (tela Tags), com a cor, e
 * permite criar uma nova ali mesmo — ela grava no registro e aparece na tela de
 * Tags como "em uso", sem cor, até alguém cadastrá-la.
 *
 * Controlado: quem usa decide quando gravar (o editor do contato grava a cada
 * mudança; o formulário do negócio, no "Salvar").
 */
export function SeletorDeTags({
  entidade,
  valor,
  onChange,
  normalizar = (bruto) => bruto.trim(),
  disabled,
  rotulo,
}: {
  entidade: EntidadeDaEtiqueta;
  valor: string[];
  onChange: (proximas: string[]) => void;
  /** A forma gravada (o contato grava minúsculo; o negócio, como digitado). */
  normalizar?: (bruto: string) => string;
  disabled?: boolean;
  rotulo: string;
}) {
  const t = useT();
  const cadastro = useEtiquetasDaEntidade(entidade);
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);

  const jaTem = new Set(valor.map((v) => v.trim().toLowerCase()));
  const termo = texto.trim().toLowerCase();
  const opcoes = cadastro
    .filter((e) => !jaTem.has(e.tag.toLowerCase()))
    .filter((e) => !termo || e.tag.toLowerCase().includes(termo))
    .slice(0, 8);
  const podeCriar =
    termo !== "" && !jaTem.has(termo) && !cadastro.some((e) => e.tag.toLowerCase() === termo);
  const cheio = valor.length >= MAXIMO;

  function adicionar(nome: string) {
    const tag = normalizar(nome);
    if (!tag || jaTem.has(tag.toLowerCase()) || cheio) return;
    onChange([...valor, tag]);
    setTexto("");
  }

  return (
    <div className="space-y-1.5">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {valor.map((tag) => (
            <ChipDeEtiqueta key={tag} tag={tag} entidade={entidade} className="h-5 gap-1 px-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => onChange(valor.filter((v) => v !== tag))}
                disabled={disabled}
                aria-label={`${t("Remover tag")} ${tag}`}
                className="rounded-sm opacity-70 hover:opacity-100"
              >
                <X size={10} weight="bold" aria-hidden />
              </button>
            </ChipDeEtiqueta>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          // O clique numa opção acontece antes do blur fechar a lista.
          onBlur={() => setTimeout(() => setAberto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (opcoes[0] && (!podeCriar || opcoes[0].tag.toLowerCase() === termo)) adicionar(opcoes[0].tag);
              else if (podeCriar) adicionar(texto);
            }
            if (e.key === "Escape") setAberto(false);
          }}
          placeholder={cheio ? t("Limite de 20 tags") : t("Buscar ou criar tag…")}
          disabled={disabled || cheio}
          maxLength={60}
          aria-label={rotulo}
          className="h-8 text-xs"
        />
        {aberto && !disabled && (opcoes.length > 0 || podeCriar) && (
          <ul
            role="listbox"
            aria-label={t("Sugestões de tags")}
            className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-xs shadow-md"
          >
            {opcoes.map((e) => (
              <li key={e.tag}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => adicionar(e.tag)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                >
                  <PontoDaEtiqueta tag={e.tag} />
                  <span className="truncate">{e.tag}</span>
                </button>
              </li>
            ))}
            {podeCriar && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => adicionar(texto)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-accent hover:bg-muted",
                    opcoes.length > 0 && "border-t border-border",
                  )}
                >
                  <Plus size={12} weight="bold" aria-hidden />
                  {t("Criar")} «{texto.trim()}»
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
