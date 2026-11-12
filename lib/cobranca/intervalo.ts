import type { Intervalo } from "@/lib/cobranca/vocabulario";

/** Quantos meses um período de cobrança cobre. */
export const MESES_DO_INTERVALO: Record<Intervalo, number> = { mes: 1, semestre: 6, ano: 12 };

/** Frase do dicionário que vai depois do preço ("R$ 1.230 por semestre"). */
export const POR_INTERVALO: Record<Intervalo, string> = { mes: "por mês", semestre: "por semestre", ano: "por ano" };

/** Nome do intervalo no seletor ("Mensal", "Semestral", "Anual"). */
export const NOME_DO_INTERVALO: Record<Intervalo, string> = { mes: "Mensal", semestre: "Semestral", ano: "Anual" };

/** O equivalente mensal, em centavos, arredondado para baixo — o número em destaque do semestral e do anual. */
export function mensalidadeEquivalente(precoCents: number, intervalo: Intervalo): number {
  return Math.floor(precoCents / MESES_DO_INTERVALO[intervalo]);
}

export function ehIntervalo(v: string): v is Intervalo {
  return v === "mes" || v === "semestre" || v === "ano";
}
