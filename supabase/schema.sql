create table if not exists users (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists user_items (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists user_achievements (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists crate_history (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists team_match_performances (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table users enable row level security;
alter table items enable row level security;
alter table user_items enable row level security;
alter table user_achievements enable row level security;
alter table crate_history enable row level security;
alter table events enable row level security;
alter table team_match_performances enable row level security;
