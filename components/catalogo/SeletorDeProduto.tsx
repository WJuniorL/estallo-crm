"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { useCatalogoDeProdutos, type ProdutoDoCatalogo } from "@/hooks/leads/useProdutosDoNegocio";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { formatCents } from "@/lib/money";
import { CaretDown, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Quantos resultados a lista DESENHA — o filtro roda no catálogo inteiro. */
export const LIMITE_NA_LISTA = 50;
/** O que a rota devolve sem paginação: catálogo desse tamanho pode estar cortado. */
const TETO_DO_CATALOGO = 500;

/** Minúsculas e sem acento: "Coleta" acha "coleta" e "Hemato" acha "hemató". */
export function chaveDeBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Os produtos cujo NOME contém o termo (todos, com termo vazio), na ordem recebida. */
export function filtrarProdutos<T extends { nome: string }>(produtos: T[], termo: string): T[] {
  const k = chaveDeBusca(termo);
  return k ? produtos.filter((p) => chaveDeBusca(p.nome).includes(k)) : produtos;
}

/**
 * Escolher um produto do catálogo DIGITANDO no próprio campo (combobox): clicar
 * abre a lista inteira, digitar filtra na hora pelo nome. Usado em todo lugar
 * que adiciona produto ao lead.
 *
 * Dois modos: com `valor` (o campo guarda a escolha e a mostra) e sem `valor`
 * (é uma AÇÃO — escolher chama `onEscolher` e o campo volta vazio).
 *
 * Milhares de produtos: o filtro é em memória e a lista desenha no máximo
 * `LIMITE_NA_LISTA`. Quando o catálogo veio no teto da rota (500), o termo
 * também vai ao servidor, que procura no catálogo inteiro.
 */
export function SeletorDeProduto({
  valor,
  onEscolher,
  aceita = (p) => p.ativo,
  moeda,
  placeholder,
  disabled,
  id,
  testId,
  ariaLabel,
  invalido,
}: {
  valor?: string | null;
  onEscolher: (produto: ProdutoDoCatalogo) => void;
  /** Quais produtos podem ser escolhidos (padrão: os ativos). */
  aceita?: (p: ProdutoDoCatalogo) => boolean;
  /** Com moeda, o preço aparece ao lado do nome. */
  moeda?: string;
  placeholder: string;
  disabled?: boolean;
  id?: string;
  testId?: string;
  ariaLabel?: string;
  invalido?: boolean;
}) {
  const t = useT();
  const catalogo = useCatalogoDeProdutos(!disabled);
  const [texto, setTexto] = useState<string | null>(null); // null = mostrando a escolha
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [escolhido, setEscolhido] = useState<ProdutoDoCatalogo | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const termo = texto ?? "";
  const [termoNoServidor, setTermoNoServidor] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setTermoNoServidor(termo.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [termo]);
  const cortado = (catalogo.data?.length ?? 0) >= TETO_DO_CATALOGO;
  const doServidor = useQuery({
    queryKey: ["catalogo-de-produtos", "busca", termoNoServidor],
    queryFn: async () =>
      (
        await apiClient.get<ApiSuccess<ProdutoDoCatalogo[]>>(
          `/api/v1/products?busca=${encodeURIComponent(termoNoServidor)}`,
        )
      ).data,
    enabled: cortado && termoNoServidor.length >= 2,
    staleTime: 60_000,
  });

  const todos = [...(catalogo.data ?? [])];
  for (const p of doServidor.data ?? []) if (!todos.some((x) => x.id === p.id)) todos.push(p);
  const encontrados = filtrarProdutos(todos.filter(aceita), termo);
  const visiveis = encontrados.slice(0, LIMITE_NA_LISTA);

  const atual = valor
    ? (todos.find((p) => p.id === valor) ?? (escolhido?.id === valor ? escolhido : null))
    : null;
  const rotulo = (p: ProdutoDoCatalogo) =>
    moeda ? `${p.nome} — ${formatCents(p.preco_cents, moeda)}` : p.nome;

  function escolher(p: ProdutoDoCatalogo) {
    setEscolhido(p);
    onEscolher(p);
    setTexto(null);
    setAberto(false);
  }

  function abrir() {
    if (disabled) return;
    setTexto("");
    setAtivo(0);
    setAberto(true);
  }

  const carregando = catalogo.isLoading || (doServidor.isFetching && visiveis.length === 0);

  return (
    <Popover open={aberto && !disabled} onOpenChange={setAberto}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={campo}
            id={id}
            value={texto ?? (atual ? rotulo(atual) : "")}
            onChange={(e) => {
              setTexto(e.target.value);
              setAtivo(0);
              setAberto(true);
            }}
            onFocus={abrir}
            onClick={() => !aberto && abrir()}
            // O clique numa opção acontece antes do blur fechar a lista.
            onBlur={() =>
              setTimeout(() => {
                setAberto(false);
                setTexto(null);
              }, 120)
            }
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!aberto) return abrir();
                const n = visiveis.length;
                if (n) setAtivo((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const p = visiveis[ativo];
                if (aberto && p) escolher(p);
              } else if (e.key === "Escape") {
                setAberto(false);
                setTexto(null);
              }
            }}
            placeholder={atual ? rotulo(atual) : placeholder}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-label={ariaLabel ?? placeholder}
            aria-expanded={aberto}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={aberto && visiveis[ativo] ? `${listaId}-${ativo}` : undefined}
            aria-invalid={invalido || undefined}
            data-testid={testId}
            className="h-9 pr-8"
          />
          <CaretDown
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-muted"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target instanceof Node && campo.current?.contains(e.target)) e.preventDefault();
        }}
        className="w-(--radix-popper-anchor-width) min-w-64 p-1 text-sm"
      >
        <ul
          id={listaId}
          role="listbox"
          aria-label={t("Produtos")}
          className="max-h-72 overflow-y-auto"
        >
          {visiveis.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={p.id === valor}
                onMouseDown={(ev) => ev.preventDefault()}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(p)}
                data-testid="opcao-de-produto"
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left",
                  i === ativo && "bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{rotulo(p)}</span>
                  {p.categoria && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.categoria}
                    </span>
                  )}
                </span>
                {p.id === valor && (
                  <Check size={14} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
        {carregando ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("Carregando…")}</p>
        ) : visiveis.length === 0 ? (
          <p
            className="px-2 py-3 text-center text-xs text-muted-foreground"
            data-testid="produto-nao-encontrado"
          >
            {termo.trim() ? t("Nenhum produto encontrado") : t("Nenhum produto no catálogo")}
          </p>
        ) : encontrados.length > visiveis.length ? (
          <p className="border-t px-2 pt-2 pb-1 text-center text-xs text-muted-foreground">
            {t("Digite para refinar a busca")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
