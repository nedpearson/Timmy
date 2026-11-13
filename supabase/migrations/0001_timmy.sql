-- Run once in the Supabase project's SQL editor. Run RLS tests before production.
create extension if not exists pgcrypto;

create table if not exists public.timmy_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null check (workspace in ('personal','legal','bridgebox','window_world_assistant','vow_os','delta_ridge','brickyard','scagscapes','boatpak')),
  title text not null check (length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, user_id)
);
create index if not exists timmy_conversations_user_ws_idx on public.timmy_conversations (user_id, workspace, updated_at desc);

create table if not exists public.timmy_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 12000),
  created_at timestamptz not null default now(),
  foreign key(conversation_id, user_id) references public.timmy_conversations(id, user_id) on delete cascade
);
create index if not exists timmy_messages_convo_idx on public.timmy_messages (user_id, conversation_id, created_at desc);
create index if not exists timmy_messages_daily_idx on public.timmy_messages (user_id, role, created_at desc);

create table if not exists public.timmy_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null check (workspace in ('personal','legal','bridgebox','window_world_assistant','vow_os','delta_ridge','brickyard','scagscapes','boatpak')),
  content text not null check (length(content) between 1 and 500),
  source text not null default 'user_explicit' check (source = 'user_explicit'),
  created_at timestamptz not null default now()
);
create index if not exists timmy_memories_user_ws_idx on public.timmy_memories (user_id, workspace, created_at desc);

revoke all on public.timmy_conversations, public.timmy_messages, public.timmy_memories from anon, public;
grant select, insert, update, delete on public.timmy_conversations to authenticated;
grant select, insert, delete on public.timmy_messages to authenticated;
grant select, insert, delete on public.timmy_memories to authenticated;
alter table public.timmy_conversations enable row level security;
alter table public.timmy_messages enable row level security;
alter table public.timmy_memories enable row level security;

create policy "timmy_conversations_owner_select" on public.timmy_conversations for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_conversations_owner_insert" on public.timmy_conversations for insert to authenticated with check (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_conversations_owner_update" on public.timmy_conversations for update to authenticated using (auth.uid() is not null and auth.uid() = user_id) with check (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_conversations_owner_delete" on public.timmy_conversations for delete to authenticated using (auth.uid() is not null and auth.uid() = user_id);

create policy "timmy_messages_owner_select" on public.timmy_messages for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_messages_owner_insert" on public.timmy_messages for insert to authenticated with check (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_messages_owner_delete" on public.timmy_messages for delete to authenticated using (auth.uid() is not null and auth.uid() = user_id);

create policy "timmy_memories_owner_select" on public.timmy_memories for select to authenticated using (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_memories_owner_insert" on public.timmy_memories for insert to authenticated with check (auth.uid() is not null and auth.uid() = user_id);
create policy "timmy_memories_owner_delete" on public.timmy_memories for delete to authenticated using (auth.uid() is not null and auth.uid() = user_id);
