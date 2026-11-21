"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useAlterarCategorias, useCategoriasDeProduto } from "@/hooks/catalogo/useCategoriasDeProduto";
import { useT } from "@/hooks/i18n/useT";
import { Check, Plus, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A categoria do produto: escolhe uma CADASTRADA (0721) pesquisando pelo nome,
 * ou cria a que falta ali mesmo. Mesmo desenho do `SeletorDeTags`, com UMA
 * escolha. Controlado: grava quem usa, no "Salvar" do formulário.
 */
export function SeletorDeCategoria({
  valor,
  onChange,
  disabled,
  testId,
}: {
  valor: string;
  onChange: (nome: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const t = useT();
  const { data: cadastro = [] } = useCategoriasDeProduto();
  const { criar } = useAlterarCategorias();
  const [texto, setTexto] = useState<string | null>(null); // null = mostrando o valor escolhido
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const termo = (texto ?? "").trim().toLowerCase();
  const opcoes = cadastro.filter((c) => !termo || c.nome.toLowerCase().includes(termo)).slice(0, 50);
  const podeCriar = termo !== "" && !cadastro.some((c) => c.nome.toLowerCase() === termo);

  function escolher(nome: string) {
    onChange(nome);
    setTexto(null);
    setAberto(false);
  }

  function criarNova() {
    const nome = (texto ?? "").trim().replace(/\s+/g, " ");
    if (!nome) return;
    criar.mutate(nome, { onSuccess: (res) => escolher(res.data.nome) });
  }

  return (
    <Popover open={aberto && !disabled && (opcoes.length > 0 || podeCriar)} onOpenChange={setAberto}>
      <PopoverAnchor asChild>
        <div className="relative mt-1">
          <Input
            ref={campo}
            value={texto ?? valor}
            onChange={(e) => {
              setTexto(e.target.value);
              setAberto(true);
            }}
            onFocus={(e) => {
              setTexto("");
              setAberto(true);
              e.currentTarget.select();
            }}
            // O clique numa opção acontece antes do blur fechar a lista.
            onBlur={() =>
              setTimeout(() => {
                setAberto(false);
                setTexto(null);
              }, 120)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const exata = opcoes.find((c) => c.nome.toLowerCase() === termo);
                if (exata) escolher(exata.nome);
                else if (opcoes[0] && termo) escolher(opcoes[0].nome);
                else if (podeCriar) criarNova();
              }
              if (e.key === "Escape") setAberto(false);
            }}
            placeholder={valor || t("Buscar ou criar categoria…")}
            disabled={disabled}
            maxLength={80}
            aria-label={t("Categoria")}
            role="combobox"
            aria-expanded={aberto}
            data-testid={testId}
            className={cn("h-9 pr-8", valor && texto === null && "font-medium")}
          />
          {valor && !disabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange("")}
              aria-label={t("Tirar categoria")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-text-muted hover:text-text"
            >
              <X size={12} weight="bold" aria-hidden />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target instanceof Node && campo.current?.contains(e.target)) e.preventDefault();
        }}
        className="w-(--radix-popper-anchor-width) p-1 text-sm"
      >
        <ul role="listbox" aria-label={t("Categorias")} className="max-h-60 overflow-y-auto">
          {opcoes.map((c) => {
            const atual = c.nome.toLowerCase() === valor.trim().toLowerCase();
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={atual}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => escolher(c.nome)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  {atual && <Check size={14} className="text-accent-text" aria-hidden />}
                </button>
              </li>
            );
          })}
          {podeCriar && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                disabled={criar.isPending}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={criarNova}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-accent-text hover:bg-muted",
                  opcoes.length > 0 && "border-t border-border",
                )}
              >
                <Plus size={12} weight="bold" aria-hidden />
                {t("Criar categoria")} «{(texto ?? "").trim()}»
              </button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
