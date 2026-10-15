"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Funis fixados no menu lateral (Estallo): até 3, na ordem em que foram fixados.
 *
 * Preferência POR NAVEGADOR, como os grupos recolhidos do `Sidebar` — sem tabela
 * nem rota. O nome viaja junto do id para o menu não precisar buscar os funis em
 * toda tela; quem abre o quadro de um funil fixado atualiza o nome (`renomear`).
 * ponytail: localStorage; vira coluna de preferência do usuário se precisar
 * acompanhar a pessoa entre computadores.
 */
export interface FunilFixado {
  id: string;
  nome: string;
}

export const MAXIMO_DE_FUNIS_FIXADOS = 3;
const CHAVE = "sidebar-funis-fixados";
const EVENTO = "funis-fixados-mudou";
const VAZIO: FunilFixado[] = [];

let cacheBruto: string | null = null;
let cache: FunilFixado[] = VAZIO;

function ler(): FunilFixado[] {
  let bruto: string | null = null;
  try {
    bruto = window.localStorage.getItem(CHAVE);
  } catch {
    return VAZIO; // storage bloqueado (aba privada): nada fixado.
  }
  if (bruto === cacheBruto) return cache;
  cacheBruto = bruto;
  try {
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    cache = Array.isArray(lista)
      ? lista
          .filter((f): f is FunilFixado => typeof f?.id === "string" && typeof f?.nome === "string")
          .slice(0, MAXIMO_DE_FUNIS_FIXADOS)
      : VAZIO;
  } catch {
    cache = VAZIO;
  }
  return cache;
}

function gravar(lista: FunilFixado[]) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Sem storage o clique não persiste; a tela segue funcionando.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso); // outra aba
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}

export function useFunisFixados() {
  const fixados = useSyncExternalStore(assinar, ler, () => VAZIO);

  const alternar = useCallback((funil: FunilFixado): boolean => {
    const atual = ler();
    if (atual.some((f) => f.id === funil.id)) {
      gravar(atual.filter((f) => f.id !== funil.id));
      return true;
    }
    if (atual.length >= MAXIMO_DE_FUNIS_FIXADOS) return false;
    gravar([...atual, funil]);
    return true;
  }, []);

  const renomear = useCallback((funil: FunilFixado) => {
    const atual = ler();
    if (atual.some((f) => f.id === funil.id && f.nome !== funil.nome)) {
      gravar(atual.map((f) => (f.id === funil.id ? funil : f)));
    }
  }, []);

  return { fixados, alternar, renomear };
}
