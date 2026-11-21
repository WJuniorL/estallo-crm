import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  support: vi.fn(),
  role: vi.fn(),
  audit: vi.fn(),
  from: vi.fn(),
  adminFrom: vi.fn(),
  gravar: vi.fn(),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.support }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/team/nome-do-membro", async (orig) => ({
  ...((await orig()) as object),
  gravarNomeDoMembro: mocks.gravar,
}));

import { PATCH } from "./route";

const ator = "f3310000-0000-4000-8000-000000000001";
const alvo = "f3310000-0000-4000-8000-000000000003";
const org = "f3310000-0000-4000-8000-000000000002";
const ctx = { params: Promise.resolve({ user_id: alvo }) };
const request = (body: unknown = { full_name: "  Elvis  " }) =>
  new NextRequest("http://local/api/v1/team/x/name", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

function cadeia(data: unknown) {
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.support.mockResolvedValue(null);
  mocks.role.mockResolvedValue({ ok: true, user: { id: ator }, org: { orgId: org } });
  mocks.adminFrom.mockReturnValue(cadeia(null));
  mocks.gravar.mockResolvedValue({ ok: true, anterior: null });
});

it("suporte só-leitura nega antes de tudo", async () => {
  mocks.support.mockResolvedValue(new Response(null, { status: 403 }));
  expect((await PATCH(request(), ctx)).status).toBe(403);
  expect(mocks.role).not.toHaveBeenCalled();
  expect(mocks.gravar).not.toHaveBeenCalled();
});

it("exige admin da organização", async () => {
  mocks.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  expect((await PATCH(request(), ctx)).status).toBe(403);
  expect(mocks.role).toHaveBeenCalledWith("admin", expect.anything());
  expect(mocks.gravar).not.toHaveBeenCalled();
});

it("nome vazio não grava", async () => {
  expect((await PATCH(request({ full_name: "   " }), ctx)).status).toBe(400);
  expect(mocks.gravar).not.toHaveBeenCalled();
});

it("membro de outra organização é 404 e não grava", async () => {
  const c = cadeia(null);
  mocks.from.mockReturnValue(c);
  expect((await PATCH(request(), ctx)).status).toBe(404);
  expect(c.eq).toHaveBeenCalledWith("organization_id", org);
  expect(mocks.gravar).not.toHaveBeenCalled();
});

it("nome de admin da plataforma não se troca pela organização", async () => {
  mocks.from.mockReturnValue(cadeia({ id: "m1" }));
  mocks.adminFrom.mockReturnValue(cadeia({ user_id: alvo }));
  expect((await PATCH(request(), ctx)).status).toBe(403);
  expect(mocks.gravar).not.toHaveBeenCalled();
});

it("grava o nome aparado e audita", async () => {
  mocks.from.mockReturnValue(cadeia({ id: "m1" }));
  const res = await PATCH(request(), ctx);
  expect(res.status).toBe(200);
  expect(mocks.gravar).toHaveBeenCalledWith(alvo, "Elvis");
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "member.name_changed",
      organizationId: org,
      resourceId: alvo,
    }),
  );
});
