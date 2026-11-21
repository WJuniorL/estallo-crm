/**
 * Cerca: texto azul usa `text-accent-text`, nunca `text-primary`/`text-accent`.
 *
 * No tema escuro `primary`/`accent` é o azul de FUNDO (#085a7f): como cor de
 * texto ele some sobre o painel e sobre o próprio tom suave — o "azul sobre
 * azul" que o dono reclamou várias vezes (pílula de prioridade, sugestões do
 * agendamento). `text-accent-text` vira #8fd9f5 no escuro. Tom suave de fundo
 * é `bg-accent-soft`, não `bg-primary/10`.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const PROIBIDO =
  /(?<![-\w])(text-primary|text-accent|bg-primary\/1[05]|bg-accent\/10)(?![-\w/\d])/g;

describe("azul de texto legível no tema escuro", () => {
  it("nenhum .tsx usa o azul de fundo como cor de texto", () => {
    const arquivos = execSync("git ls-files app components hooks lib", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."));
    const achados: string[] = [];
    for (const f of arquivos) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (/^\s*(\/\/|\*)/.test(linha)) return; // comentário documenta a história
          for (const m of linha.matchAll(PROIBIDO)) achados.push(`${f}:${i + 1} ${m[0]}`);
        });
    }
    expect(achados).toEqual([]);
  });
});
