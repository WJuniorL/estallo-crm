"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

/**
 * Corrige o nome de exibição de um membro. Usado na Equipe (admin da
 * organização) e na gestão de tenants (admin da plataforma); quem chama
 * escolhe a rota pelo `onSalvar`.
 */
export function EditarNomeDialog({
  membro,
  salvando,
  onSalvar,
  onClose,
}: {
  membro: { user_id: string; full_name: string | null; email: string | null } | null;
  salvando: boolean;
  onSalvar: (nome: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  // `key` no pai reinicia o campo a cada membro aberto.
  const [nome, setNome] = useState(membro?.full_name ?? "");
  const limpo = nome.trim();
  const valido = limpo.length > 0 && limpo.length <= 120;
  const igual = limpo === (membro?.full_name ?? "");

  return (
    <Dialog open={!!membro} onOpenChange={(aberto) => !aberto && !salvando && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Alterar nome")}</DialogTitle>
          <DialogDescription>
            {t("O nome aparece para a equipe em todas as empresas em que esta pessoa entra.")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido && !igual) onSalvar(limpo);
          }}
        >
          {membro?.email && <p className="text-sm text-muted-foreground">{membro.email}</p>}
          <Label htmlFor="nome-do-membro">{t("Nome")}</Label>
          <Input
            id="nome-do-membro"
            value={nome}
            maxLength={120}
            autoFocus
            autoComplete="off"
            onChange={(e) => setNome(e.target.value)}
          />
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={!valido || igual || salvando}>
              {salvando ? t("Salvando…") : t("Salvar nome")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
