import { describe, expect, it } from "vitest";

import { sugestoesDeHorario } from "@/components/inbox/composer/ScheduleDialog";
import { agendarSchema, editarAgendadaSchema, horarioInvalido, podeEnviar } from "./mensagem-agendada";

const id = (s: string) => s;
const agora = new Date("2026-11-19T22:45:00-03:00").getTime();
const em = (ms: number) => new Date(agora + ms).toISOString();

describe("mensagem agendada", () => {
  it("recusa horário a menos de 1 minuto ou além de um ano", () => {
    expect(horarioInvalido(em(30_000), id, agora)).toMatch(/1 minuto/);
    expect(horarioInvalido(em(-60_000), id, agora)).toMatch(/1 minuto/);
    expect(horarioInvalido(em(400 * 86_400_000), id, agora)).toMatch(/um ano/);
    expect(horarioInvalido(em(3_600_000), id, agora)).toBeNull();
  });

  it("só envia por quem ainda é agent+ ativo na organização", () => {
    expect(podeEnviar({ role: "agent", revoked_at: null })).toBe(true);
    expect(podeEnviar({ role: "admin", revoked_at: null })).toBe(true);
    expect(podeEnviar({ role: "viewer", revoked_at: null })).toBe(false);
    expect(podeEnviar({ role: "agent", revoked_at: "2026-11-01T00:00:00Z" })).toBe(false);
    expect(podeEnviar(null)).toBe(false);
  });

  it("valida o corpo e exige algo para editar", () => {
    expect(agendarSchema.safeParse({ body: "  ", send_at: em(3_600_000) }).success).toBe(false);
    expect(agendarSchema.safeParse({ body: "oi", send_at: "amanhã" }).success).toBe(false);
    expect(agendarSchema.safeParse({ body: "oi", send_at: em(3_600_000) }).success).toBe(true);
    expect(editarAgendadaSchema.safeParse({}).success).toBe(false);
  });

  it("sugere em 1 hora, amanhã às 9h e a próxima segunda às 9h", () => {
    const quinta = new Date(2026, 10, 19, 22, 45);
    const [umaHora, amanha, segunda] = sugestoesDeHorario(quinta);
    if (!umaHora || !amanha || !segunda) throw new Error("três sugestões");
    expect(umaHora.quando.getTime() - quinta.getTime()).toBe(3_600_000);
    expect([amanha.quando.getDate(), amanha.quando.getHours()]).toEqual([20, 9]);
    expect([segunda.quando.getDay(), segunda.quando.getDate(), segunda.quando.getHours()]).toEqual([1, 23, 9]);
  });
});
