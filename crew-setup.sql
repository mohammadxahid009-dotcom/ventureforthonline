-- Expedition Crew: call signs + friendships
-- Run this once in your Supabase Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  call_sign text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One relationship per unordered pair of users
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant all on public.profiles to service_role;
grant all on public.friendships to service_role;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

-- Call signs are the public search identity; emails stay private.
create policy "Anyone signed in can look up call signs"
  on public.profiles for select to authenticated using (true);

create policy "Users manage their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = user_id);

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users see friendships they are part of"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users send friend requests"
  on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

create policy "Addressee accepts a request"
  on public.friendships for update to authenticated
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);

create policy "Either side can remove a friendship or request"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
