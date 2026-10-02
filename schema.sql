-- 99% INTRIGAS · 1% VÔLEI
-- VERSÃO: jogador simples por link + admin com login + múltiplos administradores
-- Execute este arquivo inteiro no Supabase SQL Editor.

-- ============================================================
-- EXTENSÕES
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- TABELAS PRINCIPAIS
-- ============================================================

create table if not exists group_settings (
  id boolean primary key default true,
  group_name text default '99% INTRIGAS · 1% VÔLEI',
  monthly_fee numeric(10,2) default 45,
  unit_fee numeric(10,2) default 10,
  instagram_url text default '',
  spotify_url text default '',
  updated_at timestamptz default now()
);

insert into group_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  skill text not null default 'basico',
  skill_score integer not null default 2,
  whatsapp text,
  token text unique not null default encode(gen_random_bytes(16),'hex'),
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  teams_count integer not null default 2,
  notes text,
  created_at timestamptz default now()
);

create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  present boolean not null default true,
  payment_mode text not null default 'mensal',
  created_at timestamptz default now(),
  unique(game_id, player_id)
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  total_skill numeric default 0,
  created_at timestamptz default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz default now(),
  unique(team_id, player_id)
);

create table if not exists monthly_payments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  competence date not null,
  amount numeric(10,2) not null default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique(player_id, competence)
);

create table if not exists unit_payments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  amount numeric(10,2) not null default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique(game_id, player_id)
);

create table if not exists cash_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  type text not null,
  category text not null,
  description text,
  amount numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

create table if not exists var_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  link_date date,
  created_at timestamptz default now()
);

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now()
);

create table if not exists admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);

create table if not exists app_state (
  id boolean primary key default true,
  invite_token text unique,
  cash_initial numeric(10,2) default 0,
  updated_at timestamptz default now()
);

insert into app_state (id, invite_token, cash_initial)
values (true, encode(gen_random_bytes(16),'hex'), 0)
on conflict (id) do nothing;

-- ============================================================
-- HISTÓRICO DE PAGAMENTOS
-- Permite registrar pagamentos antigos de pessoas que ainda
-- não possuem cadastro no sistema.
-- ============================================================

create table if not exists payment_history (
  id uuid primary key default gen_random_uuid(),

  payment_date date not null,

  player_id uuid references players(id) on delete set null,

  player_name text not null,

  payment_type text not null default 'individual',

  game_id uuid references games(id) on delete set null,

  competence date,

  amount numeric(10,2) not null default 0,

  notes text,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_players_active
on players(active);

create index if not exists idx_games_date
on games(game_date);

create index if not exists idx_game_players_game
on game_players(game_id);

create index if not exists idx_game_players_player
on game_players(player_id);

create index if not exists idx_monthly_payments_competence
on monthly_payments(competence);

create index if not exists idx_unit_payments_game
on unit_payments(game_id);

create index if not exists idx_cash_entries_date
on cash_entries(entry_date);

create index if not exists idx_payment_history_date
on payment_history(payment_date);

create index if not exists idx_payment_history_player
on payment_history(player_id);

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

create or replace function set_monthly_paid(
  p_player_id uuid,
  p_competence date,
  p_paid boolean
)
returns void
language plpgsql
security definer
as $$
begin

  insert into monthly_payments(
    player_id,
    competence,
    amount,
    paid,
    paid_at
  )
  values(
    p_player_id,
    p_competence,
    coalesce(
      (
        select monthly_fee
        from group_settings
        where id = true
      ),
      0
    ),
    p_paid,
    case
      when p_paid then now()
      else null
    end
  )

  on conflict(player_id, competence)

  do update set
    paid = excluded.paid,
    paid_at = excluded.paid_at;

end;
$$;

create or replace function set_unit_paid(
  p_game_id uuid,
  p_player_id uuid,
  p_paid boolean
)
returns void
language plpgsql
security definer
as $$
begin

  insert into unit_payments(
    game_id,
    player_id,
    amount,
    paid,
    paid_at
  )
  values(
    p_game_id,
    p_player_id,
    coalesce(
      (
        select unit_fee
        from group_settings
        where id = true
      ),
      0
    ),
    p_paid,
    case
      when p_paid then now()
      else null
    end
  )

  on conflict(game_id, player_id)

  do update set
    paid = excluded.paid,
    paid_at = excluded.paid_at;

end;
$$;

-- ============================================================
-- PERMISSÕES BÁSICAS
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select on group_settings to anon, authenticated;
grant select on players to anon, authenticated;
grant select on games to anon, authenticated;
grant select on game_players to anon, authenticated;
grant select on teams to anon, authenticated;
grant select on team_members to anon, authenticated;
grant select on var_links to anon, authenticated;

grant insert on players to anon, authenticated;

grant select,insert,update,delete
on monthly_payments
to authenticated;

grant select,insert,update,delete
on unit_payments
to authenticated;

grant select,insert,update,delete
on game_players
to authenticated;

grant select,insert,update,delete
on games
to authenticated;

grant select,insert,update,delete
on teams
to authenticated;

grant select,insert,update,delete
on team_members
to authenticated;

grant select,insert,update,delete
on cash_entries
to authenticated;

grant select,insert,update,delete
on var_links
to authenticated;

grant select,insert,update,delete
on group_settings
to authenticated;

grant select,insert,update,delete
on admin_users
to authenticated;

grant select,insert,update,delete
on admin_invites
to authenticated;

grant select,insert,update,delete
on app_state
to authenticated;

grant select,insert,update,delete
on payment_history
to authenticated;

grant execute on function set_monthly_paid(uuid,date,boolean)
to authenticated;

grant execute on function set_unit_paid(uuid,uuid,boolean)
to authenticated;

-- ============================================================
-- ADMINISTRADOR PRINCIPAL
-- ============================================================

-- O seu usuário administrativo já existente deve continuar
-- vinculado à tabela admin_users.
--
-- Caso precise inserir novamente, use:
--
-- insert into admin_users(user_id,email)
-- values(
--   '2ba02ee9-78b9-4ee6-8658-b92a2408eafb',
--   'guilherme-stadler@hotmail.com'
-- )
-- on conflict(user_id) do nothing;

-- ============================================================
-- FIM
-- ============================================================
