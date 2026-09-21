-- Multiplayer (hunt) schema: rooms, players, targets + RPCs + RLS + realtime auth.
-- Safe to re-run.

create table if not exists public.hunt_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null check (mode in ('team','vs')),
  state text not null default 'waiting' check (state in ('waiting','active','finished','cancelled')),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  winner_user_id uuid references auth.users(id) on delete set null,
  max_players integer not null default 4,
  time_limit_minutes integer,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hunt_players (
  room_id uuid not null references public.hunt_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'joined' check (status in ('joined','left','finished')),
  completed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.hunt_targets (
  room_id uuid not null,
  user_id uuid not null,
  destination jsonb not null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (room_id, user_id),
  constraint hunt_targets_room_id_user_id_fkey
    foreign key (room_id, user_id) references public.hunt_players(room_id, user_id) on delete cascade
);

create index if not exists hunt_players_user_idx on public.hunt_players(user_id);
create index if not exists hunt_rooms_code_idx on public.hunt_rooms(code);

grant select on public.hunt_rooms to authenticated;
grant select on public.hunt_players to authenticated;
grant select on public.hunt_targets to authenticated;
grant all on public.hunt_rooms, public.hunt_players, public.hunt_targets to service_role;

-- Membership helper (security definer avoids recursive RLS).
create or replace function public.is_hunt_member(_room_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hunt_players
    where room_id = _room_id and user_id = _user_id and status <> 'left'
  )
$$;

create or replace function public.is_hunt_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_hunt_member(p_room_id, auth.uid())
$$;

alter table public.hunt_rooms enable row level security;
alter table public.hunt_players enable row level security;
alter table public.hunt_targets enable row level security;

drop policy if exists "members read room" on public.hunt_rooms;
create policy "members read room" on public.hunt_rooms for select to authenticated
  using (host_user_id = auth.uid() or public.is_hunt_member(id, auth.uid()));

drop policy if exists "members read players" on public.hunt_players;
create policy "members read players" on public.hunt_players for select to authenticated
  using (public.is_hunt_member(room_id, auth.uid()));

drop policy if exists "own target read" on public.hunt_targets;
create policy "own target read" on public.hunt_targets for select to authenticated
  using (user_id = auth.uid());

-- ---------- RPCs ----------
create or replace function public.create_hunt_room(p_mode text, p_display_name text)
returns public.hunt_rooms language plpgsql security definer set search_path = public as $$
declare v_code text; v_room public.hunt_rooms; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to create a hunt.'; end if;
  if p_mode not in ('team','vs') then raise exception 'Unknown hunt mode.'; end if;
  loop
    v_code := upper(substr(replace(encode(gen_random_bytes(8),'base64'),'/',''), 1, 6));
    v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
    exit when length(v_code) = 6 and not exists (select 1 from public.hunt_rooms where code = v_code and state in ('waiting','active'));
  end loop;

  insert into public.hunt_rooms (code, mode, host_user_id)
  values (v_code, p_mode, v_uid)
  returning * into v_room;

  insert into public.hunt_players (room_id, user_id, display_name)
  values (v_room.id, v_uid, coalesce(nullif(trim(p_display_name),''),'Explorer'));

  return v_room;
end $$;

create or replace function public.join_hunt_room(p_code text, p_display_name text)
returns public.hunt_rooms language plpgsql security definer set search_path = public as $$
declare v_room public.hunt_rooms; v_uid uuid := auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'Sign in to join a hunt.'; end if;
  select * into v_room from public.hunt_rooms
    where code = upper(p_code) and state in ('waiting','active')
    order by created_at desc limit 1;
  if v_room.id is null then raise exception 'No open hunt with that room code.'; end if;

  select count(*) into v_count from public.hunt_players where room_id = v_room.id and status <> 'left';
  if v_count >= v_room.max_players and not exists (
    select 1 from public.hunt_players where room_id = v_room.id and user_id = v_uid
  ) then
    raise exception 'That hunt is full.';
  end if;

  insert into public.hunt_players (room_id, user_id, display_name, status)
  values (v_room.id, v_uid, coalesce(nullif(trim(p_display_name),''),'Explorer'), 'joined')
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name, status = 'joined';

  return v_room;
end $$;

create or replace function public.start_hunt_room_timed(p_room_id uuid, p_time_limit_minutes integer default null)
returns public.hunt_rooms language plpgsql security definer set search_path = public as $$
declare v_room public.hunt_rooms;
begin
  select * into v_room from public.hunt_rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Hunt not found.'; end if;
  if v_room.host_user_id <> auth.uid() then raise exception 'Only the host can start the hunt.'; end if;
  if p_time_limit_minutes is not null and (p_time_limit_minutes < 5 or p_time_limit_minutes > 180) then
    raise exception 'Time limit must be between 5 and 180 minutes.';
  end if;

  update public.hunt_rooms set
    state = 'active',
    started_at = now(),
    time_limit_minutes = p_time_limit_minutes,
    expires_at = case when p_time_limit_minutes is null then null else now() + make_interval(mins => p_time_limit_minutes) end,
    updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return v_room;
end $$;

create or replace function public.start_hunt_room(p_room_id uuid)
returns public.hunt_rooms language sql security definer set search_path = public as $$
  select public.start_hunt_room_timed(p_room_id, null)
$$;

create or replace function public.expire_hunt_room(p_room_id uuid)
returns public.hunt_rooms language plpgsql security definer set search_path = public as $$
declare v_room public.hunt_rooms;
begin
  if not public.is_hunt_member(p_room_id, auth.uid()) then raise exception 'Not part of this hunt.'; end if;
  update public.hunt_rooms
    set state = 'finished', finished_at = now(), updated_at = now()
    where id = p_room_id and state = 'active'
    returning * into v_room;
  if v_room.id is null then select * into v_room from public.hunt_rooms where id = p_room_id; end if;
  return v_room;
end $$;

create or replace function public.leave_hunt_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.hunt_rooms;
begin
  update public.hunt_players set status = 'left' where room_id = p_room_id and user_id = v_uid;
  select * into v_room from public.hunt_rooms where id = p_room_id;
  if v_room.id is not null and v_room.host_user_id = v_uid and v_room.state = 'waiting' then
    update public.hunt_rooms set state = 'cancelled', updated_at = now() where id = p_room_id;
  end if;
end $$;

create or replace function public.set_hunt_target(p_room_id uuid, p_destination jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_hunt_member(p_room_id, v_uid) then raise exception 'Not part of this hunt.'; end if;
  insert into public.hunt_targets (room_id, user_id, destination)
  values (p_room_id, v_uid, p_destination)
  on conflict (room_id, user_id) do update
    set destination = excluded.destination, assigned_at = now(), completed_at = null;
end $$;

create or replace function public.complete_hunt_target(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.hunt_rooms;
begin
  if not public.is_hunt_member(p_room_id, v_uid) then raise exception 'Not part of this hunt.'; end if;
  update public.hunt_targets set completed_at = now() where room_id = p_room_id and user_id = v_uid;
  update public.hunt_players set completed_at = now(), status = 'finished' where room_id = p_room_id and user_id = v_uid;

  select * into v_room from public.hunt_rooms where id = p_room_id;
  if v_room.mode = 'vs' and v_room.winner_user_id is null then
    update public.hunt_rooms set winner_user_id = v_uid, state = 'finished', finished_at = now(), updated_at = now()
      where id = p_room_id;
  elsif not exists (
    select 1 from public.hunt_players where room_id = p_room_id and status = 'joined'
  ) then
    update public.hunt_rooms set state = 'finished', finished_at = now(), updated_at = now() where id = p_room_id;
  end if;
end $$;

grant execute on function
  public.create_hunt_room(text, text),
  public.join_hunt_room(text, text),
  public.start_hunt_room_timed(uuid, integer),
  public.start_hunt_room(uuid),
  public.expire_hunt_room(uuid),
  public.leave_hunt_room(uuid),
  public.set_hunt_target(uuid, jsonb),
  public.complete_hunt_target(uuid),
  public.is_hunt_member(uuid),
  public.is_hunt_member(uuid, uuid)
to authenticated;

-- ---------- Realtime private channel authorization ----------
create or replace function public.is_hunt_realtime_member(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_topic is null or left(p_topic, 5) <> 'hunt:' then return false; end if;
  begin
    v_id := substr(p_topic, 6)::uuid;
  exception when others then return false;
  end;
  return public.is_hunt_member(v_id, auth.uid());
end $$;

grant execute on function public.is_hunt_realtime_member(text) to authenticated;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='realtime' and table_name='messages') then
    execute 'drop policy if exists "hunt members read realtime" on realtime.messages';
    execute 'create policy "hunt members read realtime" on realtime.messages for select to authenticated using (public.is_hunt_realtime_member(topic))';
    execute 'drop policy if exists "hunt members write realtime" on realtime.messages';
    execute 'create policy "hunt members write realtime" on realtime.messages for insert to authenticated with check (public.is_hunt_realtime_member(topic))';
  end if;
end $$;

-- postgres_changes needs the tables in the realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hunt_rooms') then
      execute 'alter publication supabase_realtime add table public.hunt_rooms';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hunt_players') then
      execute 'alter publication supabase_realtime add table public.hunt_players';
    end if;
  end if;
end $$;
