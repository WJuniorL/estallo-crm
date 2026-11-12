-- manifest: cobranca_planos ganha o intervalo semestral, os tetos de pipelines, etapas por pipeline, leads, automações e webhooks e o acesso à API REST; fn_limite_do_plano aceita os recursos novos, fn_plano_libera_api responde pela API, e cinco gatilhos recusam com PT402 o que passa do plano
--
-- Os planos da Estallo (Essencial, Profissional, Escala; mensal, semestral e anual) limitam mais do que pessoas,
-- números e IA. Cada teto novo é uma coluna anulável (nulo = sem limite, como os de antes) e cada recurso tem um
-- gatilho no MESMO molde de `fn_trava_assentos_do_plano`: só confere quem PASSA a ocupar vaga, trava consultiva por
-- org (pipeline, no caso das etapas) para duas entradas simultâneas não verem o mesmo "cabe mais um", e a mensagem
-- `limite_do_plano:<recurso>:<teto>` é o contrato com lib/cobranca/limites.ts. Com a cobrança desligada, org isenta
-- ou plano sem teto, `fn_limite_do_plano` devolve nulo e nada é conferido — instalação que não cobra não muda.
--
-- O que conta:
--   pipelines   crm_pipelines não arquivados da org
--   etapas      crm_stages não arquivadas do MESMO pipeline (o teto é por pipeline)
--   leads       crm_leads da org, qualquer status (ganho e perdido seguem ocupando a base)
--   automacoes  followup_flow_pointers com surface = 'crm_automation' (rascunho conta: é um fluxo que existe)
--   webhooks    webhook_sources da org
--
-- `libera_api` nasce verdadeira: plano que já existia segue liberando a API depois do update.sh.
--
-- Idempotente: repetir não muda nada. Portável em psql puro.

-- ── A. o intervalo semestral ─────────────────────────────────────────────────
alter table public.cobranca_planos drop constraint if exists cobranca_planos_intervalo_check;
alter table public.cobranca_planos
  add constraint cobranca_planos_intervalo_check check (intervalo in ('mes', 'semestre', 'ano'));

-- ── B. os tetos novos ────────────────────────────────────────────────────────
alter table public.cobranca_planos
  add column if not exists max_pipelines integer check (max_pipelines >= 1),
  add column if not exists max_etapas_por_pipeline integer check (max_etapas_por_pipeline >= 2),
  add column if not exists max_leads integer check (max_leads >= 1),
  add column if not exists max_automacoes integer check (max_automacoes >= 1),
  add column if not exists max_webhooks integer check (max_webhooks >= 1),
  add column if not exists libera_api boolean not null default true;

comment on column public.cobranca_planos.max_etapas_por_pipeline is
  'Teto de etapas não arquivadas em CADA pipeline (mínimo 2: um funil precisa de entrada e de saída). Nulo = sem limite.';
comment on column public.cobranca_planos.libera_api is
  'false = token de API (dsk_) desta empresa recebe 403 plan_feature_unavailable. Lido por fn_plano_libera_api.';

-- ── C. o limite do plano, com os recursos novos ──────────────────────────────
create or replace function public.fn_limite_do_plano(p_org uuid, p_recurso text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plano public.cobranca_planos%rowtype;
begin
  if p_recurso is null or p_recurso not in ('assentos', 'canais', 'ia_usd_cents', 'pipelines', 'etapas', 'leads', 'automacoes', 'webhooks') then
    raise exception 'recurso_do_plano_invalido' using errcode = '22023';
  end if;
  if not public.fn_cobranca_ligada() then
    return null;
  end if;
  select p.* into v_plano
    from public.cobranca_assinaturas a
    join public.cobranca_planos p on p.id = a.plano_id
   where a.organization_id = p_org;
  if not found then
    return null;
  end if;
  return case p_recurso
    when 'assentos' then v_plano.max_assentos
    when 'canais' then v_plano.max_canais
    when 'pipelines' then v_plano.max_pipelines
    when 'etapas' then v_plano.max_etapas_por_pipeline
    when 'leads' then v_plano.max_leads
    when 'automacoes' then v_plano.max_automacoes
    when 'webhooks' then v_plano.max_webhooks
    else v_plano.teto_ia_usd_cents
  end;
end;
$$;

revoke execute on function public.fn_limite_do_plano(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_limite_do_plano(uuid, text) to service_role;

-- ── D. a API REST no plano ───────────────────────────────────────────────────
-- Verdadeira quando a cobrança está desligada, a org é isenta ou o plano libera.
create or replace function public.fn_plano_libera_api(p_org uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_libera boolean;
begin
  if not public.fn_cobranca_ligada() then
    return true;
  end if;
  select p.libera_api into v_libera
    from public.cobranca_assinaturas a
    join public.cobranca_planos p on p.id = a.plano_id
   where a.organization_id = p_org;
  return coalesce(v_libera, true);
end;
$$;

revoke execute on function public.fn_plano_libera_api(uuid) from public, anon, authenticated;
grant execute on function public.fn_plano_libera_api(uuid) to service_role;

-- ── E. a recusa comum ────────────────────────────────────────────────────────
create or replace function public.fn_recusa_limite_do_plano(p_recurso text, p_limite integer, p_em_uso integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'limite_do_plano:%:%', p_recurso, p_limite
    using errcode = 'PT402',
          detail = jsonb_build_object('recurso', p_recurso, 'limite', p_limite, 'em_uso', p_em_uso)::text;
end;
$$;

revoke execute on function public.fn_recusa_limite_do_plano(text, integer, integer) from public, anon, authenticated;

-- ── F. pipelines ─────────────────────────────────────────────────────────────
create or replace function public.fn_trava_pipelines_do_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_em_uso integer;
begin
  if new.is_archived then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.is_archived and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;
  v_limite := public.fn_limite_do_plano(new.organization_id, 'pipelines');
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 2283));
  select count(*) into v_em_uso
    from public.crm_pipelines p
   where p.organization_id = new.organization_id and not p.is_archived and p.id <> new.id;
  if v_em_uso >= v_limite then
    perform public.fn_recusa_limite_do_plano('pipelines', v_limite, v_em_uso);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_trava_pipelines_do_plano() from public, anon, authenticated;

drop trigger if exists trg_trava_pipelines_do_plano on public.crm_pipelines;
create trigger trg_trava_pipelines_do_plano
  before insert or update of is_archived, organization_id on public.crm_pipelines
  for each row execute function public.fn_trava_pipelines_do_plano();

-- ── G. etapas por pipeline ───────────────────────────────────────────────────
create or replace function public.fn_trava_etapas_do_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_em_uso integer;
begin
  if new.is_archived then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.is_archived and new.pipeline_id is not distinct from old.pipeline_id then
    return new;
  end if;
  v_limite := public.fn_limite_do_plano(new.organization_id, 'etapas');
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.pipeline_id::text, 2284));
  select count(*) into v_em_uso
    from public.crm_stages s
   where s.pipeline_id = new.pipeline_id and not s.is_archived and s.id <> new.id;
  if v_em_uso >= v_limite then
    perform public.fn_recusa_limite_do_plano('etapas', v_limite, v_em_uso);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_trava_etapas_do_plano() from public, anon, authenticated;

drop trigger if exists trg_trava_etapas_do_plano on public.crm_stages;
create trigger trg_trava_etapas_do_plano
  before insert or update of is_archived, pipeline_id on public.crm_stages
  for each row execute function public.fn_trava_etapas_do_plano();

-- ── H. leads ─────────────────────────────────────────────────────────────────
-- ponytail: count(*) por inserção; com centenas de milhares de leads por org, um contador por org resolve.
create or replace function public.fn_trava_leads_do_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_em_uso integer;
begin
  if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;
  v_limite := public.fn_limite_do_plano(new.organization_id, 'leads');
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 2285));
  select count(*) into v_em_uso
    from public.crm_leads l
   where l.organization_id = new.organization_id and l.id <> new.id;
  if v_em_uso >= v_limite then
    perform public.fn_recusa_limite_do_plano('leads', v_limite, v_em_uso);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_trava_leads_do_plano() from public, anon, authenticated;

drop trigger if exists trg_trava_leads_do_plano on public.crm_leads;
create trigger trg_trava_leads_do_plano
  before insert or update of organization_id on public.crm_leads
  for each row execute function public.fn_trava_leads_do_plano();

-- ── I. automações do CRM ─────────────────────────────────────────────────────
create or replace function public.fn_trava_automacoes_do_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_em_uso integer;
begin
  if new.surface is distinct from 'crm_automation' then
    return new;
  end if;
  -- A superfície não muda depois de criado (fn_superficie_do_fluxo_imutavel): só a inserção e a troca de org contam.
  if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;
  v_limite := public.fn_limite_do_plano(new.organization_id, 'automacoes');
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 2286));
  select count(*) into v_em_uso
    from public.followup_flow_pointers f
   where f.organization_id = new.organization_id and f.surface = 'crm_automation' and f.id <> new.id;
  if v_em_uso >= v_limite then
    perform public.fn_recusa_limite_do_plano('automacoes', v_limite, v_em_uso);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_trava_automacoes_do_plano() from public, anon, authenticated;

drop trigger if exists trg_trava_automacoes_do_plano on public.followup_flow_pointers;
create trigger trg_trava_automacoes_do_plano
  before insert or update of organization_id on public.followup_flow_pointers
  for each row execute function public.fn_trava_automacoes_do_plano();

-- ── J. webhooks de entrada ───────────────────────────────────────────────────
create or replace function public.fn_trava_webhooks_do_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_em_uso integer;
begin
  if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;
  v_limite := public.fn_limite_do_plano(new.organization_id, 'webhooks');
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 2287));
  select count(*) into v_em_uso
    from public.webhook_sources w
   where w.organization_id = new.organization_id and w.id <> new.id;
  if v_em_uso >= v_limite then
    perform public.fn_recusa_limite_do_plano('webhooks', v_limite, v_em_uso);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_trava_webhooks_do_plano() from public, anon, authenticated;

drop trigger if exists trg_trava_webhooks_do_plano on public.webhook_sources;
create trigger trg_trava_webhooks_do_plano
  before insert or update of organization_id on public.webhook_sources
  for each row execute function public.fn_trava_webhooks_do_plano();
