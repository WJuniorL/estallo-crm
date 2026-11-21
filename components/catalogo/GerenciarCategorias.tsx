"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAlterarCategorias,
  useCategoriasDeProduto,
  type CategoriaDeProduto,
} from "@/hooks/catalogo/useCategoriasDeProduto";
import { useT } from "@/hooks/i18n/useT";
import { Check, PencilSimple, Plus, Trash, X } from "@/lib/ui/icons";

/**
 * O cadastro de categorias (0721), fora do formulário do produto: criar,
 * renomear (os produtos acompanham) e apagar (só sem produto nela — a rota
 * recusa com a contagem).
 */
export function GerenciarCategorias({
  open,
  onOpenChange,
  onRenomeou,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Os produtos mudaram de categoria: quem mostra a lista relê. */
  onRenomeou?: () => void;
}) {
  const t = useT();
  const { data: categorias = [], isLoading } = useCategoriasDeProduto();
  const { criar } = useAlterarCategorias();
  const [nova, setNova] = useState("");

  function adicionar() {
    const nome = nova.trim();
    if (!nome) return;
    criar.mutate(nome, { onSuccess: () => setNova("") });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" data-testid="gerenciar-categorias">
        <DialogHeader>
          <DialogTitle>{t("Categorias de produto")}</DialogTitle>
          <DialogDescription>
            {t("As categorias aparecem na lista ao cadastrar ou editar um produto.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar();
          }}
        >
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder={t("Nova categoria")}
            maxLength={80}
            aria-label={t("Nova categoria")}
            data-testid="nova-categoria"
          />
          <Button type="submit" disabled={!nova.trim() || criar.isPending}>
            <Plus size={14} aria-hidden />
            {t("Adicionar")}
          </Button>
        </form>

        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <li className="px-3 py-3 text-sm text-text-muted">{t("Carregando…")}</li>
          ) : categorias.length === 0 ? (
            <li className="px-3 py-3 text-sm text-text-muted">{t("Nenhuma categoria cadastrada ainda.")}</li>
          ) : (
            categorias.map((c) => <LinhaDaCategoria key={c.id} categoria={c} onRenomeou={onRenomeou} />)
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function LinhaDaCategoria({ categoria, onRenomeou }: { categoria: CategoriaDeProduto; onRenomeou?: () => void }) {
  const t = useT();
  const { renomear, apagar } = useAlterarCategorias();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(categoria.nome);

  function salvar() {
    const novo = nome.trim();
    if (!novo || novo === categoria.nome) return setEditando(false);
    renomear.mutate(
      { id: categoria.id, nome: novo },
      {
        onSuccess: () => {
          setEditando(false);
          onRenomeou?.();
        },
      },
    );
  }

  if (editando) {
    return (
      <li className="flex items-center gap-1.5 px-2 py-1.5">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              salvar();
            }
            if (e.key === "Escape") setEditando(false);
          }}
          maxLength={80}
          autoFocus
          aria-label={t("Nome da categoria")}
          className="h-8"
        />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={salvar} aria-label={t("Salvar")}>
          <Check size={14} aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => {
            setNome(categoria.nome);
            setEditando(false);
          }}
          aria-label={t("Cancelar")}
        >
          <X size={14} aria-hidden />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1.5 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{categoria.nome}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={() => setEditando(true)}
        aria-label={`${t("Renomear")} ${categoria.nome}`}
      >
        <PencilSimple size={14} aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 hover:text-error"
        disabled={apagar.isPending}
        onClick={() => apagar.mutate(categoria.id)}
        aria-label={`${t("Apagar")} ${categoria.nome}`}
      >
        <Trash size={14} aria-hidden />
      </Button>
    </li>
  );
}
