-- =============================================
-- BetTracker DB 스키마
-- Supabase SQL Editor에서 실행하세요
-- =============================================

create table if not exists bets (
  id text primary key,
  date text not null,
  category text not null,
  league text not null,
  site text not null,
  bet_option text not null,
  home_team text,
  away_team text,
  team_name text,
  amount numeric not null default 0,
  odds numeric not null default 1,
  profit numeric,
  result text not null default '진행중',
  include_stats boolean not null default true,
  is_dollar boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists deposits (
  id text primary key,
  site text not null,
  amount numeric not null default 0,
  date text not null,
  is_dollar boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists withdrawals (
  id text primary key,
  site text not null,
  amount numeric not null default 0,
  date text not null,
  is_dollar boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists site_states (
  site text primary key,
  deposited numeric not null default 0,
  bet_total numeric not null default 0,
  active boolean not null default false,
  is_dollar boolean not null default false,
  updated_at timestamptz default now()
);

create table if not exists custom_leagues (
  id serial primary key,
  category text not null,
  name text not null,
  created_at timestamptz default now(),
  unique(category, name)
);

create table if not exists esports_records (
  id text primary key,
  league text not null,
  date text not null,
  team_a text not null,
  team_b text not null,
  score_a int not null default 0,
  score_b int not null default 0,
  created_at timestamptz default now()
);

create table if not exists profit_extras (
  id text primary key,
  category text not null,
  sub_category text default '',
  amount numeric not null default 0,
  date text not null,
  note text default '',
  is_income boolean not null default true,
  created_at timestamptz default now()
);

-- RLS 비활성화 (개인 전용 앱)
alter table bets disable row level security;
alter table deposits disable row level security;
alter table withdrawals disable row level security;
alter table site_states disable row level security;
alter table custom_leagues disable row level security;
alter table esports_records disable row level security;
alter table profit_extras disable row level security;
