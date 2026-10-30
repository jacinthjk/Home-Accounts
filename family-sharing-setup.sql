-- =====================================================================
-- Home Accounts – Family sharing: one-time cloud set-up (Supabase)
--
-- HOW TO USE: Supabase dashboard → your project → SQL Editor → New query
--             → paste this whole file → Run.  (Safe to run again.)
-- VERSION 2 (Oct 2026): adds linking your own other devices and month plans.
--             If you ran an older version, simply run this file again.
--
-- PRIVACY: every entry is encrypted on the phone before it is sent.
-- This database only ever stores scrambled text ("blob") that it cannot read.
-- Nobody can read or write the tables directly – only through the
-- functions below, which check that the person is an active family member
-- and has the right permission:
--   owner  – everything, and invites / removes people
--   editor – add, edit and delete anyone's entries
--   member – add entries, and edit / delete only their own
-- =====================================================================

create table if not exists public.ha_books (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null,
  key_check  text not null check (length(key_check) < 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.ha_members (
  book_id   uuid not null references public.ha_books(id) on delete cascade,
  user_id   uuid not null,
  role      text not null check (role in ('owner', 'editor', 'member')),
  status    text not null default 'active' check (status in ('active', 'removed')),
  name_enc  text check (name_enc is null or length(name_enc) < 2000),
  joined_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create table if not exists public.ha_invites (
  code       text primary key,
  book_id    uuid not null references public.ha_books(id) on delete cascade,
  role       text not null,
  created_by uuid not null,
  expires_at timestamptz not null,
  used_by    uuid,
  used_at    timestamptz
);
-- (updated in version 2: 'owner' invites link the owner's own other devices)
alter table public.ha_invites drop constraint if exists ha_invites_role_check;
alter table public.ha_invites add constraint ha_invites_role_check check (role in ('owner', 'editor', 'member'));

create sequence if not exists public.ha_seq;

create table if not exists public.ha_entries (
  book_id    uuid not null references public.ha_books(id) on delete cascade,
  id         text not null check (length(id) <= 200),
  author     uuid not null,
  updated_by uuid not null,
  seq        bigint not null default nextval('public.ha_seq'),
  deleted    boolean not null default false,
  blob       text check (blob is null or length(blob) <= 60000),
  primary key (book_id, id)
);
create index if not exists ha_entries_book_seq on public.ha_entries (book_id, seq);

-- Lock the tables: no direct access for anyone (only the functions below).
alter table public.ha_books   enable row level security;
alter table public.ha_members enable row level security;
alter table public.ha_invites enable row level security;
alter table public.ha_entries enable row level security;
revoke all on table public.ha_books, public.ha_members, public.ha_invites, public.ha_entries from public, anon, authenticated;
revoke all on sequence public.ha_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper: the caller's role in a book (null if not an active member)
-- ---------------------------------------------------------------------
create or replace function public.ha_role(p_book uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.ha_members m
  where m.book_id = p_book and m.user_id = auth.uid() and m.status = 'active'
$$;

-- Owner creates a family book
create or replace function public.ha_create_book(p_key_check text, p_name_enc text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.ha_books where owner = auth.uid()) >= 5 then
    raise exception 'too many family books' using errcode = 'P0001';
  end if;
  insert into public.ha_books (owner, key_check) values (auth.uid(), p_key_check) returning id into b;
  insert into public.ha_members (book_id, user_id, role, name_enc) values (b, auth.uid(), 'owner', p_name_enc);
  return b;
end $$;

-- Owner makes a one-time invite (valid 48 hours)
create or replace function public.ha_create_invite(p_book uuid, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if public.ha_role(p_book) is distinct from 'owner' then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  -- 'owner' invites are for the owner's own other phones / computers
  if p_role not in ('owner', 'editor', 'member') then raise exception 'bad role' using errcode = 'P0001'; end if;
  delete from public.ha_invites where book_id = p_book and (expires_at < now() or used_by is not null);
  if (select count(*) from public.ha_invites where book_id = p_book) >= 20 then
    raise exception 'too many open invites' using errcode = 'P0001';
  end if;
  c := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.ha_invites (code, book_id, role, created_by, expires_at)
  values (c, p_book, p_role, auth.uid(), now() + interval '48 hours');
  return c;
end $$;

-- A family member uses an invite
create or replace function public.ha_join(p_code text, p_name_enc text) returns json
language plpgsql security definer set search_path = public as $$
declare inv public.ha_invites; r text; kc text;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into inv from public.ha_invites where code = p_code for update;
  if not found or inv.used_by is not null or inv.expires_at < now() then
    raise exception 'invite not valid' using errcode = 'P0001';
  end if;
  update public.ha_invites set used_by = auth.uid(), used_at = now() where code = p_code;
  insert into public.ha_members (book_id, user_id, role, status, name_enc)
  values (inv.book_id, auth.uid(), inv.role, 'active', p_name_enc)
  on conflict (book_id, user_id) do update
    set role = case when public.ha_members.role = 'owner' then 'owner' else excluded.role end,
        status = 'active', name_enc = excluded.name_enc;
  select m.role into r from public.ha_members m where m.book_id = inv.book_id and m.user_id = auth.uid();
  select b.key_check into kc from public.ha_books b where b.id = inv.book_id;
  return json_build_object('book_id', inv.book_id, 'role', r, 'key_check', kc);
end $$;

-- List the family (names are encrypted)
create or replace function public.ha_members_list(p_book uuid)
returns table (user_id uuid, role text, status text, name_enc text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.ha_role(p_book) is null then raise exception 'not a member' using errcode = '42501'; end if;
  return query select m.user_id, m.role, m.status, m.name_enc from public.ha_members m
               where m.book_id = p_book order by m.joined_at;
end $$;

-- Owner changes someone's permission, or removes a person or one of the owner's other devices
create or replace function public.ha_set_member(p_book uuid, p_user uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.ha_role(p_book) is distinct from 'owner' then
    raise exception 'only the owner can change members' using errcode = '42501';
  end if;
  if p_user = auth.uid() then raise exception 'cannot change your own device' using errcode = 'P0001'; end if;
  if p_user = (select b.owner from public.ha_books b where b.id = p_book) then
    raise exception 'cannot change the device that started the family book' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'editor', 'member') or p_status not in ('active', 'removed') then
    raise exception 'bad value' using errcode = 'P0001';
  end if;
  update public.ha_members set role = p_role, status = p_status
  where book_id = p_book and user_id = p_user;
end $$;

-- A member (or one of the owner's other devices) leaves the family book.
-- The device that started the book cannot leave; it can only delete the book.
create or replace function public.ha_leave(p_book uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ha_members set status = 'removed'
  where book_id = p_book and user_id = auth.uid()
    and user_id <> (select b.owner from public.ha_books b where b.id = p_book);
end $$;

-- The device that started the family book deletes it from the cloud
create or replace function public.ha_delete_book(p_book uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.ha_role(p_book) is distinct from 'owner'
     or auth.uid() is distinct from (select b.owner from public.ha_books b where b.id = p_book) then
    raise exception 'only the owner can delete the family book' using errcode = '42501';
  end if;
  delete from public.ha_books where id = p_book;
end $$;

-- Changes since the last sync
create or replace function public.ha_pull(p_book uuid, p_since bigint, p_limit int default 500)
returns table (id text, author uuid, seq bigint, deleted boolean, blob text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.ha_role(p_book) is null then raise exception 'not a member' using errcode = '42501'; end if;
  return query select e.id, e.author, e.seq, e.deleted, e.blob from public.ha_entries e
               where e.book_id = p_book and e.seq > p_since
               order by e.seq limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end $$;

-- Specific entries (used when a change was not allowed, to put back the real one)
create or replace function public.ha_get(p_book uuid, p_ids text[])
returns table (id text, author uuid, seq bigint, deleted boolean, blob text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.ha_role(p_book) is null then raise exception 'not a member' using errcode = '42501'; end if;
  return query select e.id, e.author, e.seq, e.deleted, e.blob from public.ha_entries e
               where e.book_id = p_book and e.id = any (p_ids);
end $$;

-- Save changes. Each row: {"id": "...", "blob": "...", "deleted": false}
-- Returns {"ok": [{"id": "...", "seq": 123}], "rejected": ["..."]}
create or replace function public.ha_push(p_book uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rw jsonb; my_role text; ex public.ha_entries; uid uuid := auth.uid();
  rid text; s bigint; ok jsonb := '[]'::jsonb; bad jsonb := '[]'::jsonb;
begin
  my_role := public.ha_role(p_book);
  if my_role is null then raise exception 'not a member' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'bad rows' using errcode = 'P0001';
  end if;
  for rw in select * from jsonb_array_elements(p_rows) loop
    rid := rw->>'id';
    if rid is null or length(rid) > 200 then bad := bad || to_jsonb(coalesce(rid, '')); continue; end if;
    select * into ex from public.ha_entries where book_id = p_book and id = rid for update;
    if found then
      if ex.author = uid or my_role in ('owner', 'editor') then
        update public.ha_entries
           set blob = rw->>'blob', deleted = coalesce((rw->>'deleted')::boolean, false),
               updated_by = uid, seq = nextval('public.ha_seq')
         where book_id = p_book and id = rid
        returning seq into s;
        ok := ok || jsonb_build_object('id', rid, 'seq', s);
      else
        bad := bad || to_jsonb(rid);
      end if;
    else
      -- shared settings and month plans may only be created by the owner or an editor
      if (rid like 'S|%' or rid like 'P|%') and my_role not in ('owner', 'editor') then bad := bad || to_jsonb(rid); continue; end if;
      -- expenses and notes carry their author's id at the end: nobody can create one in someone else's name
      if (rid like 'L|%' or rid like 'N|%') and rid not like ('%|' || uid::text) then bad := bad || to_jsonb(rid); continue; end if;
      insert into public.ha_entries (book_id, id, author, updated_by, deleted, blob)
      values (p_book, rid, uid, uid, coalesce((rw->>'deleted')::boolean, false), rw->>'blob')
      returning seq into s;
      ok := ok || jsonb_build_object('id', rid, 'seq', s);
    end if;
  end loop;
  return jsonb_build_object('ok', ok, 'rejected', bad);
end $$;

-- Only signed-in app users may call these; the helper is internal only.
revoke all on function public.ha_role(uuid) from public, anon, authenticated;
revoke all on function public.ha_create_book(text, text), public.ha_create_invite(uuid, text), public.ha_join(text, text),
  public.ha_members_list(uuid), public.ha_set_member(uuid, uuid, text, text), public.ha_leave(uuid), public.ha_delete_book(uuid),
  public.ha_pull(uuid, bigint, int), public.ha_get(uuid, text[]), public.ha_push(uuid, jsonb) from public, anon;
grant execute on function public.ha_create_book(text, text), public.ha_create_invite(uuid, text), public.ha_join(text, text),
  public.ha_members_list(uuid), public.ha_set_member(uuid, uuid, text, text), public.ha_leave(uuid), public.ha_delete_book(uuid),
  public.ha_pull(uuid, bigint, int), public.ha_get(uuid, text[]), public.ha_push(uuid, jsonb) to authenticated;
