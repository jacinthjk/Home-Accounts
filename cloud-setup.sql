-- =====================================================================
-- Home Accounts – one-time cloud set-up (Supabase)
--
-- HOW TO USE: Supabase dashboard → your project → SQL Editor → New query
--             → paste this whole file → Run.  (Safe to run again.)
-- VERSION 3 (Oct 2026): accounts with a mobile number + password, so a
--             person can log in on several devices. Version 2 added month
--             plans. If you ran an older version, simply run this file again.
--
-- ACCOUNTS: the app signs people in with Supabase's email + password
-- sign-in, using an address made from the mobile number
-- (e.g. 919876543210@phone.home-accounts.app – no email is ever sent).
-- In Authentication → Sign In / Providers → Email, turn OFF "Confirm email".
-- The password itself never reaches the cloud: the app sends a value derived
-- from it, and keeps a different derived key (that unlocks the data) on the phone.
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

-- =====================================================================
-- ACCOUNTS (version 3)
-- One profile per account, keyed by mobile number (unique). It holds only
-- locked boxes: the person's data key locked with their password
-- (pw_wrap) and with their recovery code (rc_wrap), and their key ring
-- (which family book they use and its key) locked with that data key.
-- The cloud cannot open any of them.
-- =====================================================================
create table if not exists public.ha_profiles (
  user_id     uuid primary key,
  phone       text not null unique check (phone ~ '^\+[0-9]{8,15}$'),
  pw_wrap     text not null check (length(pw_wrap) < 2000),
  rc_wrap     text check (rc_wrap is null or length(rc_wrap) < 2000),
  rc_verifier text check (rc_verifier is null or rc_verifier ~ '^[0-9a-f]{64}$'),
  keyring     text check (keyring is null or length(keyring) < 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.ha_profiles enable row level security;
revoke all on table public.ha_profiles from public, anon, authenticated;

-- The account's sign-in address must be the one made from this mobile number
create or replace function public.ha_phone_matches(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u where u.id = auth.uid()
                 and lower(u.email) = substr(p_phone, 2) || '@phone.home-accounts.app')
$$;

-- Called once, right after signing up
create or replace function public.ha_register(p_phone text, p_pw_wrap text, p_rc_wrap text, p_rc_verifier text, p_keyring text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.ha_phone_matches(p_phone) then raise exception 'mobile number does not match the account' using errcode = '42501'; end if;
  insert into public.ha_profiles (user_id, phone, pw_wrap, rc_wrap, rc_verifier, keyring)
  values (auth.uid(), p_phone, p_pw_wrap, p_rc_wrap, p_rc_verifier, p_keyring)
  on conflict (user_id) do update set pw_wrap = excluded.pw_wrap, rc_wrap = excluded.rc_wrap,
    rc_verifier = excluded.rc_verifier, keyring = excluded.keyring, updated_at = now();
end $$;

-- The caller's own profile (null if not registered yet)
create or replace function public.ha_profile_get() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('phone', p.phone, 'pw_wrap', p.pw_wrap, 'rc_wrap', p.rc_wrap, 'keyring', p.keyring)
  from public.ha_profiles p where p.user_id = auth.uid()
$$;

-- Update the caller's profile (null = keep as it is)
create or replace function public.ha_profile_update(p_pw_wrap text default null, p_rc_wrap text default null,
  p_rc_verifier text default null, p_keyring text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.ha_profiles set
    pw_wrap = coalesce(p_pw_wrap, pw_wrap), rc_wrap = coalesce(p_rc_wrap, rc_wrap),
    rc_verifier = coalesce(p_rc_verifier, rc_verifier), keyring = coalesce(p_keyring, keyring), updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'no profile' using errcode = 'P0001'; end if;
end $$;

-- Forgot password, step 1: prove you have the recovery code; get the box it opens.
-- (The proof is derived from the 20-character recovery code, so guessing is hopeless.)
create or replace function public.ha_recovery_start(p_phone text, p_proof text) returns json
language plpgsql security definer set search_path = public as $$
declare pr public.ha_profiles;
begin
  select * into pr from public.ha_profiles where phone = p_phone;
  if not found or pr.rc_verifier is null or pr.rc_verifier <> encode(sha256(convert_to(coalesce(p_proof, ''), 'UTF8')), 'hex') then
    raise exception 'recovery code not correct' using errcode = 'P0001';
  end if;
  return json_build_object('rc_wrap', pr.rc_wrap);
end $$;

-- Forgot password, step 2: set the new password (as the app derives it) and the newly locked data key
create or replace function public.ha_recovery_finish(p_phone text, p_proof text, p_new_auth text, p_pw_wrap text) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.ha_profiles;
begin
  select * into pr from public.ha_profiles where phone = p_phone for update;
  if not found or pr.rc_verifier is null or pr.rc_verifier <> encode(sha256(convert_to(coalesce(p_proof, ''), 'UTF8')), 'hex') then
    raise exception 'recovery code not correct' using errcode = 'P0001';
  end if;
  if length(coalesce(p_new_auth, '')) < 20 or length(coalesce(p_pw_wrap, '')) < 20 then
    raise exception 'bad value' using errcode = 'P0001';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_auth, extensions.gen_salt('bf')), updated_at = now()
  where id = pr.user_id;
  update public.ha_profiles set pw_wrap = p_pw_wrap, updated_at = now() where user_id = pr.user_id;
end $$;

-- Delete my account: my profile, the family books I started, my memberships and my sign-in
create or replace function public.ha_delete_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.ha_books where owner = auth.uid();
  delete from public.ha_members where user_id = auth.uid();
  delete from public.ha_profiles where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.ha_phone_matches(text) from public, anon, authenticated;
revoke all on function public.ha_register(text, text, text, text, text), public.ha_profile_get(),
  public.ha_profile_update(text, text, text, text), public.ha_delete_account() from public, anon;
grant execute on function public.ha_register(text, text, text, text, text), public.ha_profile_get(),
  public.ha_profile_update(text, text, text, text), public.ha_delete_account() to authenticated;
revoke all on function public.ha_recovery_start(text, text), public.ha_recovery_finish(text, text, text, text) from public;
grant execute on function public.ha_recovery_start(text, text), public.ha_recovery_finish(text, text, text, text) to anon, authenticated;

-- Only signed-in app users may call these; the helper is internal only.
revoke all on function public.ha_role(uuid) from public, anon, authenticated;
revoke all on function public.ha_create_book(text, text), public.ha_create_invite(uuid, text), public.ha_join(text, text),
  public.ha_members_list(uuid), public.ha_set_member(uuid, uuid, text, text), public.ha_leave(uuid), public.ha_delete_book(uuid),
  public.ha_pull(uuid, bigint, int), public.ha_get(uuid, text[]), public.ha_push(uuid, jsonb) from public, anon;
grant execute on function public.ha_create_book(text, text), public.ha_create_invite(uuid, text), public.ha_join(text, text),
  public.ha_members_list(uuid), public.ha_set_member(uuid, uuid, text, text), public.ha_leave(uuid), public.ha_delete_book(uuid),
  public.ha_pull(uuid, bigint, int), public.ha_get(uuid, text[]), public.ha_push(uuid, jsonb) to authenticated;
