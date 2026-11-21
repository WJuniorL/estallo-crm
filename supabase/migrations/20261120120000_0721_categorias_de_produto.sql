-- manifest: **Categorias de produto cadastradas.** Tabela `catalog_categories` (nome único por organização, sem diferenciar maiúsculas): a tela de Produtos passa a escolher a categoria de uma lista pesquisável, e as categorias se criam, renomeiam e apagam fora do formulário do produto. `catalog_products.categoria` continua TEXTO — é o que a planilha, a busca e as ferramentas da IA já leem — e o cadastro é a fonte da lista: o gatilho `trg_catalog_products_registra_categoria` cadastra a categoria nova que chegar por QUALQUER porta (tela, planilha, API), e `trg_catalog_categories_renomeia` leva o nome novo aos produtos na mesma transação. Apagar categoria em uso é recusado na rota. Backfill: as categorias já gravadas nos produtos entram no cadastro. RLS no molde de `catalog_products` (lê a organização, escreve manager+). Idempotente; apêndice no `baseline.sql`.

create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (nome = btrim(nome) and length(nome) between 1 and 80),
  created_at timestamptz not null default now()
);

comment on table public.catalog_categories is
  'Categorias de produto da organização. catalog_products.categoria guarda o NOME; este cadastro é a lista oferecida na tela.';

create unique index if not exists catalog_categories_nome_uk
  on public.catalog_categories (organization_id, lower(nome));

-- Backfill: o que já está nos produtos vira cadastro (a mesma grafia do primeiro).
insert into public.catalog_categories (organization_id, nome)
select distinct on (p.organization_id, lower(btrim(p.categoria)))
       p.organization_id, left(btrim(p.categoria), 80)
  from public.catalog_products p
 where p.categoria is not null and btrim(p.categoria) <> ''
 order by p.organization_id, lower(btrim(p.categoria)), p.created_at
on conflict do nothing;

alter table public.catalog_categories enable row level security;

drop policy if exists catalog_categories_select on public.catalog_categories;
create policy catalog_categories_select on public.catalog_categories
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

drop policy if exists catalog_categories_insert on public.catalog_categories;
create policy catalog_categories_insert on public.catalog_categories
  for insert with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists catalog_categories_update on public.catalog_categories;
create policy catalog_categories_update on public.catalog_categories
  for update using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists catalog_categories_delete on public.catalog_categories;
create policy catalog_categories_delete on public.catalog_categories
  for delete using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.catalog_categories from public, anon;
grant select, insert, update, delete on public.catalog_categories to authenticated;
grant all on public.catalog_categories to service_role;

-- Produto salvo com categoria que o cadastro não tem: cadastra. Roda como quem
-- salvou o produto (manager+ ou service_role), que já pode escrever no cadastro.
create or replace function public.fn_catalog_products_registra_categoria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.categoria is not null and btrim(new.categoria) <> '' then
    insert into public.catalog_categories (organization_id, nome)
    values (new.organization_id, left(btrim(new.categoria), 80))
    on conflict (organization_id, lower(nome)) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_catalog_products_registra_categoria() from public, anon;

drop trigger if exists trg_catalog_products_registra_categoria on public.catalog_products;
create trigger trg_catalog_products_registra_categoria
  after insert or update of categoria on public.catalog_products
  for each row execute function public.fn_catalog_products_registra_categoria();

-- Renomear a categoria leva o nome novo aos produtos dela, na mesma transação.
create or replace function public.fn_catalog_categories_renomeia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.nome is distinct from old.nome then
    update public.catalog_products
       set categoria = new.nome
     where organization_id = new.organization_id
       and lower(btrim(categoria)) = lower(old.nome);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_catalog_categories_renomeia() from public, anon;

drop trigger if exists trg_catalog_categories_renomeia on public.catalog_categories;
create trigger trg_catalog_categories_renomeia
  after update of nome on public.catalog_categories
  for each row execute function public.fn_catalog_categories_renomeia();
