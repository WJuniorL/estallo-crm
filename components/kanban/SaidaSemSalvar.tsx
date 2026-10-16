"use client";

import { useCallback, useId, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

export interface EstadoDaFicha {
  pendente: boolean;
  salvando: boolean;
}

export interface SaidaProtegida {
  /** O `id` do formulário da ficha — o botão fixo e o "Salvar e fechar" o submetem. */
  formId: string;
  estado: EstadoDaFicha;
  aoMudarEstado: (e: EstadoDaFicha) => void;
  /** Fechar a gaveta: pergunta antes se houver alteração sem salvar. */
  pedirFechar: () => void;
  aoSalvar: () => void;
  aoFalharAoSalvar: () => void;
  dialogo: React.ReactNode;
}

/**
 * Sair do dossiê com a ficha alterada e não salva PERGUNTA antes. A ficha só
 * grava no "Salvar" — sem esta pergunta, fechar a gaveta por engano (Esc, clique
 * fora, o X) jogaria fora o que a pessoa digitou sem nada na tela dizer.
 *
 * Três saídas: salvar e fechar, sair descartando, ou continuar editando.
 */
export function useSaidaProtegida(fechar: () => void): SaidaProtegida {
  const t = useT();
  const formId = `ficha-do-lead-${useId().replace(/:/g, "")}`;
  const [estado, setEstado] = useState<EstadoDaFicha>({ pendente: false, salvando: false });
  const [perguntando, setPerguntando] = useState(false);
  // "Salvar e fechar" submete a ficha; quem fecha é o sucesso do salvamento.
  const fecharAoSalvar = useRef(false);

  const aoMudarEstado = useCallback((e: EstadoDaFicha) => {
    setEstado((antes) =>
      antes.pendente === e.pendente && antes.salvando === e.salvando ? antes : e,
    );
  }, []);
  const pedirFechar = () => (estado.pendente ? setPerguntando(true) : fechar());
  const aoSalvar = () => {
    if (!fecharAoSalvar.current) return;
    fecharAoSalvar.current = false;
    fechar();
  };
  const aoFalharAoSalvar = () => {
    fecharAoSalvar.current = false;
  };

  const dialogo = (
    <AlertDialog open={perguntando} onOpenChange={setPerguntando}>
      <AlertDialogContent data-testid="dossie-sair-sem-salvar">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Sair sem salvar?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Você alterou este lead e ainda não salvou. Se sair agora, as alterações serão descartadas.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Continuar editando")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              setPerguntando(false);
              fechar();
            }}
          >
            {t("Descartar alterações")}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => {
              // `requestSubmit` e não `type="submit"`: o botão some junto com a
              // janela no mesmo clique, e o envio nativo podia não acontecer.
              fecharAoSalvar.current = true;
              (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
            }}
          >
            {t("Salvar e fechar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { formId, estado, aoMudarEstado, pedirFechar, aoSalvar, aoFalharAoSalvar, dialogo };
}
