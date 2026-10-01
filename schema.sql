-- 99% INTRIGAS · 1% VÔLEI
-- VERSÃO: jogador simples por link + admin com login + múltiplos administradores
-- Execute este arquivo inteiro no Supabase SQL Editor.
--
-- PRIMEIRO ADMIN:
-- 1) Crie seu usuário em Supabase > Authentication > Users > Add user
--    (e-mail + senha).
-- 2) Depois de executar este SQL, substitua SEU_EMAIL_AQUI pelo e-mail usado
--    e execute somente o INSERT indicado no final deste arquivo.
--
-- Jogadores NÃO precisam de conta/e-mail/senha. Eles entram pelo link de cadastro.

create extension if not exists pgcrypto;

create table if not exists public.group_settings (
  id boolean primary key default true,
  group_name text not null default '99% INTRIGAS · 1% VÔLEI',
  monthly_fee numeric(10,2) not null default 0,
  unit_fee numeric(10,2) not null default 15,
  invite_token uuid not null default gen_random_uuid(),
  instagram_url text not null default 'https://www.instagram.com/rededeintrigas.voleiclub/',
  spotify_url text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.group_settings(id) values(true) on conflict(id) do nothing;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  skill_level text not null check(skill_level in ('iniciante','basico','intermediario','avancado','expert')),
  skill_score int not null check(skill_score between 1 and 5),
  access_token uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  teams_count int not null default 2 check(teams_count between 2 and 4),
  notes text default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  present boolean not null default false,
  payment_mode text not null default 'mensal' check(payment_mode in ('mensal','individual')),
  unique(game_id, player_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_no int not null,
  total_skill int not null default 0,
  unique(game_id, team_no)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key(team_id, player_id)
);

create table if not exists public.monthly_payments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  competence date not null,
  amount numeric(10,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  unique(player_id, competence)
);

create table if not exists public.unit_payments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(10,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  unique(game_id, player_id)
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check(entry_type in ('in','out')),
  category text not null,
  description text not null,
  amount numeric(10,2) not null check(amount >= 0),
  source_type text,
  source_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.var_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  game_date date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ---------- FUNÇÕES DE SEGURANÇA ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.admin_users where user_id=auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Cadastro público do jogador: somente nome + habilidade.
create or replace function public.register_player(
  p_invite_token uuid,
  p_name text,
  p_skill_level text
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_score int;
  v_player public.players;
begin
  if not exists(select 1 from public.group_settings where id=true and invite_token=p_invite_token) then
    raise exception 'link_de_cadastro_invalido';
  end if;

  p_name := trim(coalesce(p_name,''));
  if length(p_name) < 2 or length(p_name) > 80 then
    raise exception 'nome_invalido';
  end if;

  v_score := case lower(trim(p_skill_level))
    when 'iniciante' then 1
    when 'basico' then 2
    when 'intermediario' then 3
    when 'avancado' then 4
    when 'expert' then 5
    else 0
  end;

  if v_score=0 then raise exception 'habilidade_invalida'; end if;

  insert into public.players(name,skill_level,skill_score)
  values(p_name,lower(trim(p_skill_level)),v_score)
  returning * into v_player;

  return jsonb_build_object(
    'id',v_player.id,
    'name',v_player.name,
    'skill_level',v_player.skill_level,
    'access_token',v_player.access_token
  );
end;
$$;

grant execute on function public.register_player(uuid,text,text) to anon, authenticated;

-- Conteúdo que o jogador pode consultar.
create or replace function public.get_player_view(p_access_token uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_player public.players;
  v_game public.games;
  v_result jsonb;
begin
  select * into v_player from public.players
  where access_token=p_access_token and active=true;

  if v_player.id is null then raise exception 'jogador_nao_encontrado'; end if;

  select * into v_game from public.games
  where game_date >= current_date
  order by game_date asc limit 1;

  select jsonb_build_object(
    'player', jsonb_build_object(
      'id',v_player.id,'name',v_player.name,'skill_level',v_player.skill_level
    ),
    'settings', (select jsonb_build_object(
      'group_name',group_name,'instagram_url',instagram_url,'spotify_url',spotify_url
    ) from public.group_settings where id=true),
    'game', case when v_game.id is null then null else jsonb_build_object(
      'id',v_game.id,'game_date',v_game.game_date,'teams_count',v_game.teams_count,'notes',v_game.notes
    ) end,
    'var', coalesce((select jsonb_agg(jsonb_build_object(
      'title',title,'url',url,'game_date',game_date
    ) order by created_at desc) from public.var_links),'[]'::jsonb),
    'teams', case when v_game.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_no',t.team_no,
        'total_skill',t.total_skill,
        'members',coalesce((
          select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'skill_level',p.skill_level) order by p.name)
          from public.team_members tm join public.players p on p.id=tm.player_id
          where tm.team_id=t.id
        ),'[]'::jsonb)
      ) order by t.team_no)
      from public.teams t where t.game_id=v_game.id
    ),'[]'::jsonb) end
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_player_view(uuid) to anon, authenticated;

-- Alteração de pagamento + caixa em uma transação.
create or replace function public.set_monthly_paid(p_player uuid,p_competence date,p_paid boolean)
returns void
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_amount numeric;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select id,amount into v_id,v_amount from public.monthly_payments
    where player_id=p_player and competence=p_competence;
  if v_id is null then
    select monthly_fee into v_amount from public.group_settings where id=true;
    insert into public.monthly_payments(player_id,competence,amount,paid,paid_at)
      values(p_player,p_competence,v_amount,p_paid,case when p_paid then now() else null end)
      returning id into v_id;
  else
    update public.monthly_payments set paid=p_paid,paid_at=case when p_paid then now() else null end where id=v_id;
  end if;

  delete from public.cash_entries where source_type='monthly_payment' and source_id=v_id;
  if p_paid then
    insert into public.cash_entries(entry_type,category,description,amount,source_type,source_id,created_by)
    select 'in','Mensalidade','Mensalidade — '||p.name||' — '||to_char(p_competence,'MM/YYYY'),
      v_amount,'monthly_payment',v_id,auth.uid()
    from public.players p where p.id=p_player;
  end if;
end;
$$;
grant execute on function public.set_monthly_paid(uuid,date,boolean) to authenticated;

create or replace function public.set_unit_paid(p_game uuid,p_player uuid,p_paid boolean)
returns void
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_amount numeric;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select id,amount into v_id,v_amount from public.unit_payments
    where game_id=p_game and player_id=p_player;
  if v_id is null then
    select unit_fee into v_amount from public.group_settings where id=true;
    insert into public.unit_payments(game_id,player_id,amount,paid,paid_at)
      values(p_game,p_player,v_amount,p_paid,case when p_paid then now() else null end)
      returning id into v_id;
  else
    update public.unit_payments set paid=p_paid,paid_at=case when p_paid then now() else null end where id=v_id;
  end if;

  delete from public.cash_entries where source_type='unit_payment' and source_id=v_id;
  if p_paid then
    insert into public.cash_entries(entry_type,category,description,amount,source_type,source_id,created_by)
    select 'in','Individual','Individual — '||p.name, v_amount,'unit_payment',v_id,auth.uid()
    from public.players p where p.id=p_player;
  end if;
end;
$$;
grant execute on function public.set_unit_paid(uuid,uuid,boolean) to authenticated;

-- Conceder/revogar administrador.
create or replace function public.set_admin_email(p_email text)
returns void
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  p_email := lower(trim(p_email));
  insert into public.admin_invites(email,created_by) values(p_email,auth.uid())
  on conflict(email) do update set created_by=excluded.created_by;
  select id into v_id from auth.users where lower(email)=p_email limit 1;
  if v_id is not null then
    insert into public.admin_users(user_id,email) values(v_id,p_email)
    on conflict(user_id) do nothing;
  end if;
end;
$$;
grant execute on function public.set_admin_email(text) to authenticated;

create or replace function public.remove_admin(p_user uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_user=auth.uid() then raise exception 'nao_remova_voce_mesmo'; end if;
  delete from public.admin_users where user_id=p_user;
end;
$$;
grant execute on function public.remove_admin(uuid) to authenticated;

-- ---------- TRIGGER: usuário convidado como admin ----------
create or replace function public.handle_admin_user()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  if exists(select 1 from public.admin_invites where lower(email)=lower(new.email)) then
    insert into public.admin_users(user_id,email) values(new.id,lower(new.email))
    on conflict(user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_admin_created on auth.users;
create trigger on_auth_admin_created after insert on auth.users
for each row execute procedure public.handle_admin_user();

-- ---------- RLS ----------
alter table public.group_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_invites enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.monthly_payments enable row level security;
alter table public.unit_payments enable row level security;
alter table public.cash_entries enable row level security;
alter table public.var_links enable row level security;

-- Nada é liberado diretamente para anon: jogador usa apenas as RPCs acima.
-- Admin autenticado pode gerenciar os dados.
drop policy if exists admin_settings on public.group_settings;
create policy admin_settings on public.group_settings for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists admin_users_self on public.admin_users;
create policy admin_users_self on public.admin_users for select to authenticated
using(user_id=auth.uid() or public.is_admin());

drop policy if exists admin_invites_admin on public.admin_invites;
create policy admin_invites_admin on public.admin_invites for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists players_admin on public.players;
create policy players_admin on public.players for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists games_admin on public.games;
create policy games_admin on public.games for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists gp_admin on public.game_players;
create policy gp_admin on public.game_players for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists teams_admin on public.teams;
create policy teams_admin on public.teams for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists tm_admin on public.team_members;
create policy tm_admin on public.team_members for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists monthly_admin on public.monthly_payments;
create policy monthly_admin on public.monthly_payments for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists unit_admin on public.unit_payments;
create policy unit_admin on public.unit_payments for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists cash_admin on public.cash_entries;
create policy cash_admin on public.cash_entries for all to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists var_admin on public.var_links;
create policy var_admin on public.var_links for all to authenticated
using(public.is_admin()) with check(public.is_admin());

-- PRIMEIRO ADMIN:
-- Depois de criar seu usuário em Authentication > Users, execute:
-- insert into public.admin_users(user_id,email)
-- select id,email from auth.users where lower(email)=lower('SEU_EMAIL_AQUI')
-- on conflict(user_id) do nothing;
