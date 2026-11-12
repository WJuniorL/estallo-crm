-- manifest: **Dashboard de vendas (`/app/dashboard`, aba Vendas) — a conta de um funil inteiro numa função só.** `fn_dashboard_vendas(p_org, p_pipeline, p_from, p_to, p_owner, p_source)` devolve, para UM funil: a carteira aberta AGORA por moeda; ganhos e perdidos FECHADOS na janela `[p_from, p_to)` e na janela anterior de igual duração (para a comparação); a mediana do ciclo de venda dos ganhos; o fluxo por etapa (quantos negócios criados na janela chegaram a cada etapa, e quantos estão nela agora); o ranking dos ganhos por dono (pessoa ou agente de IA); os produtos dos negócios ganhos; os motivos de perda; 12 meses de negócios criados por status no fuso da organização; os 8 negócios abertos parados há mais tempo na etapa; e as origens do funil para o filtro. Por que SQL e não leitura linha a linha na rota: a rota irmã `metrics/funil` corta em 5.000 linhas, e uma base importada passa disso. **SECURITY INVOKER** e `stable`, no molde de `fn_channel_metrics` (0590): a RLS de `crm_leads` é o portão (agent vê os próprios, manager+ a organização), e `organization_id = p_org` vem da rota, nunca do body. **Moeda não mistura** (regra de `lib/metrics/perdas.ts`): todo valor sai por moeda, e o sem-moeda vira o balde `sem moeda`. Transferência entre funis (`lost_reason = 'moved_to_another_pipeline'`, 0266) não é perda e fica fora de tudo. Ausência é `null`, nunca 0 (mediana sem ganho sai `null`). "Chegou à etapa" é posicional: ganho alcançou todas; perdido alcançou até a etapa de onde saiu (`lost_from_stage_id`); aberto, até a etapa atual — negócio criado no meio do funil conta as anteriores, e a tela diz isso. Nenhuma tabela nem índice novo. Idempotente (`create or replace`), portável em psql puro; revoga `public` e `anon`, concede a `authenticated` e `service_role`; apêndice idempotente no `baseline.sql` antes da VARREDURA anon (0116).
create or replace function public.fn_dashboard_vendas(
  p_org uuid,
  p_pipeline uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null,
  p_source text default null
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  fuso as (
    select coalesce(
      (select nullif(o.timezone, '') from public.organizations o where o.id = p_org),
      'America/Sao_Paulo'
    ) as tz
  ),
  etapas as (
    select s.id, s.name, s.position, s.color, s.is_won, s.is_lost, s.is_archived
    from public.crm_stages s
    where s.organization_id = p_org and s.pipeline_id = p_pipeline
  ),
  base as (
    select
      l.id, l.title, l.status, l.stage_id, l.lost_from_stage_id, l.lost_reason,
      coalesce(l.value_cents, 0) as valor,
      coalesce(nullif(btrim(l.currency), ''), 'sem moeda') as moeda,
      l.created_at, l.closed_at, coalesce(l.stage_changed_at, l.created_at) as na_etapa_desde,
      l.owner_kind, l.owner_user_id, l.owner_agent_id
    from public.crm_leads l
    where l.organization_id = p_org
      and l.pipeline_id = p_pipeline
      and (p_owner is null or l.owner_user_id = p_owner)
      and (p_source is null or l.source = p_source)
      and not (l.status = 'lost' and coalesce(l.lost_reason, '') = 'moved_to_another_pipeline')
  ),
  -- Fechados na janela atual e na anterior de igual duração.
  fechados as (
    select b.*, case when b.closed_at >= p_from then 'atual' else 'anterior' end as janela
    from base b
    where b.status in ('won', 'lost')
      and b.closed_at >= p_from - (p_to - p_from)
      and b.closed_at < p_to
  ),
  resumo as (
    select
      j.janela,
      count(f.id) filter (where f.status = 'won') as ganhos,
      count(f.id) filter (where f.status = 'lost') as perdidos,
      percentile_cont(0.5) within group (
        order by extract(epoch from (f.closed_at - f.created_at)) / 86400.0
      ) filter (where f.status = 'won') as ciclo_mediana_dias
    from (values ('atual'), ('anterior')) as j(janela)
    left join fechados f on f.janela = j.janela
    group by j.janela
  ),
  valores as (
    select janela, status, moeda, count(*) as quantidade, sum(valor) as valor_cents
    from fechados
    group by janela, status, moeda
  ),
  periodo as (
    select jsonb_object_agg(r.janela, jsonb_build_object(
      'ganhos', r.ganhos,
      'perdidos', r.perdidos,
      'ciclo_mediana_dias', r.ciclo_mediana_dias,
      'ganhos_por_moeda', coalesce((
        select jsonb_agg(jsonb_build_object('moeda', v.moeda, 'quantidade', v.quantidade, 'valor_cents', v.valor_cents) order by v.moeda)
        from valores v where v.janela = r.janela and v.status = 'won'), '[]'::jsonb),
      'perdidos_por_moeda', coalesce((
        select jsonb_agg(jsonb_build_object('moeda', v.moeda, 'quantidade', v.quantidade, 'valor_cents', v.valor_cents) order by v.moeda)
        from valores v where v.janela = r.janela and v.status = 'lost'), '[]'::jsonb)
    )) as j
    from resumo r
  ),
  abertos_agora as (
    select stage_id, moeda, count(*) as quantidade, sum(valor) as valor_cents
    from base where status = 'open'
    group by stage_id, moeda
  ),
  criados as (
    select * from base where created_at >= p_from and created_at < p_to
  ),
  primeira_etapa as (
    select min(position) as pos from etapas where not is_won and not is_lost and not is_archived
  ),
  alcance as (
    select
      c.id,
      case
        when c.status = 'won' then null::numeric  -- alcançou todas: tratado à parte
        when c.status = 'lost' then coalesce(
          sl.position,
          case when not s.is_won and not s.is_lost then s.position end,
          (select pos from primeira_etapa)
        )
        else s.position
      end as pos,
      c.status
    from criados c
    left join etapas s on s.id = c.stage_id
    left join etapas sl on sl.id = c.lost_from_stage_id
  ),
  fluxo as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'stage_id', e.id,
      'nome', e.name,
      'posicao', e.position,
      'cor', e.color,
      'ganho', e.is_won,
      'chegaram', case
        when e.is_won then (select count(*) from alcance a where a.status = 'won')
        else (select count(*) from alcance a where a.status = 'won' or a.pos >= e.position)
      end,
      'agora', coalesce((
        select jsonb_agg(jsonb_build_object('moeda', ag.moeda, 'quantidade', ag.quantidade, 'valor_cents', ag.valor_cents) order by ag.moeda)
        from abertos_agora ag where ag.stage_id = e.id), '[]'::jsonb)
    ) order by e.is_won, e.position), '[]'::jsonb) as j
    from etapas e
    where not e.is_lost and not e.is_archived
  ),
  carteira as (
    select coalesce(jsonb_agg(jsonb_build_object('moeda', moeda, 'quantidade', quantidade, 'valor_cents', valor_cents) order by moeda), '[]'::jsonb) as j
    from (
      select moeda, sum(quantidade) as quantidade, sum(valor_cents) as valor_cents
      from abertos_agora group by moeda
    ) x
  ),
  ranking as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tipo', x.tipo,
      'user_id', x.owner_user_id,
      'agent_id', x.owner_agent_id,
      'agente_nome', ag.name,
      'moeda', x.moeda,
      'ganhos', x.ganhos,
      'valor_cents', x.valor_cents
    ) order by x.valor_cents desc, x.ganhos desc), '[]'::jsonb) as j
    from (
      select
        case
          when f.owner_kind = 'ai' then 'ia'
          when f.owner_user_id is not null then 'pessoa'
          else 'sem_dono'
        end as tipo,
        f.owner_user_id, f.owner_agent_id, f.moeda,
        count(*) as ganhos, sum(f.valor) as valor_cents
      from fechados f
      where f.janela = 'atual' and f.status = 'won'
      group by 1, f.owner_user_id, f.owner_agent_id, f.moeda
    ) x
    left join public.ai_agents ag on ag.id = x.owner_agent_id
  ),
  produtos as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', x.product_id, 'nome', x.nome, 'moeda', x.moeda,
      'quantidade', x.quantidade, 'receita_cents', x.receita_cents, 'negocios', x.negocios
    ) order by x.receita_cents desc, x.nome), '[]'::jsonb) as j
    from (
      select
        p.product_id,
        max(p.nome) as nome,
        f.moeda,
        sum(p.quantidade) as quantidade,
        sum(greatest(p.quantidade * p.preco_unitario_cents - p.desconto_cents, 0)) as receita_cents,
        count(distinct f.id) as negocios
      from fechados f
      join public.crm_lead_products p
        on p.lead_id = f.id and p.organization_id = p_org
      where f.janela = 'atual' and f.status = 'won'
      group by p.product_id, case when p.product_id is null then p.nome end, f.moeda
      order by receita_cents desc
      limit 20
    ) x
  ),
  perdas as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'motivo', x.motivo, 'quantidade', x.quantidade
    ) order by x.quantidade desc, x.motivo nulls last), '[]'::jsonb) as j
    from (
      select nullif(btrim(f.lost_reason), '') as motivo, count(*) as quantidade
      from fechados f
      where f.janela = 'atual' and f.status = 'lost'
      group by 1
    ) x
  ),
  mensal as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'mes', x.mes, 'status', x.status, 'moeda', x.moeda,
      'quantidade', x.quantidade, 'valor_cents', x.valor_cents
    ) order by x.mes, x.status, x.moeda), '[]'::jsonb) as j
    from (
      select
        to_char(date_trunc('month', b.created_at at time zone fz.tz), 'YYYY-MM') as mes,
        b.status, b.moeda, count(*) as quantidade, sum(b.valor) as valor_cents
      from base b cross join fuso fz
      where b.created_at >= (date_trunc('month', p_to at time zone fz.tz) - interval '11 months') at time zone fz.tz
        and b.created_at < p_to
      group by 1, b.status, b.moeda
    ) x
  ),
  parados as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'lead_id', x.id, 'titulo', x.title, 'etapa', x.etapa, 'moeda', x.moeda,
      'valor_cents', x.valor, 'owner_user_id', x.owner_user_id, 'na_etapa_desde', x.na_etapa_desde
    ) order by x.na_etapa_desde, x.id), '[]'::jsonb) as j
    from (
      select b.id, b.title, s.name as etapa, b.moeda, b.valor, b.owner_user_id, b.na_etapa_desde
      from base b left join etapas s on s.id = b.stage_id
      where b.status = 'open'
      order by b.na_etapa_desde, b.id
      limit 8
    ) x
  ),
  -- As origens do funil para o filtro da tela: lidas sem os recortes de dono e
  -- de origem, senão escolher uma origem esconderia as outras do seletor.
  origens as (
    select coalesce(jsonb_agg(x.source order by x.source), '[]'::jsonb) as j
    from (
      select distinct l.source
      from public.crm_leads l
      where l.organization_id = p_org and l.pipeline_id = p_pipeline
        and nullif(btrim(l.source), '') is not null
    ) x
  )
  select jsonb_build_object(
    'fuso', (select tz from fuso),
    'origens', (select j from origens),
    'carteira', (select j from carteira),
    'periodo', (select j from periodo),
    'fluxo', (select j from fluxo),
    'ranking', (select j from ranking),
    'produtos', (select j from produtos),
    'perdas', (select j from perdas),
    'mensal', (select j from mensal),
    'parados', (select j from parados)
  );
$$;

revoke all on function public.fn_dashboard_vendas(uuid, uuid, timestamptz, timestamptz, uuid, text) from public;
revoke execute on function public.fn_dashboard_vendas(uuid, uuid, timestamptz, timestamptz, uuid, text) from anon;
grant execute on function public.fn_dashboard_vendas(uuid, uuid, timestamptz, timestamptz, uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
