-- Ajaia Docs schema: profiles, documents and sharing.
--
-- The browser talks to Supabase directly, so every access rule lives here in
-- Postgres (Row Level Security + column privileges), not in the React code.
-- tests/rls.test.ts runs this exact file against an in-process Postgres (PGlite).

-- Profiles mirror auth.users so people can be found by email without exposing auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    constraint documents_owner_id_fkey references public.profiles (id) on delete cascade,
  title text not null default 'Untitled document',
  -- TipTap/ProseMirror JSON: keeps headings, lists and marks without storing raw HTML.
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  -- Optimistic locking: every save must name the version it started from.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint title_length check (char_length(btrim(title)) between 1 and 200),
  constraint content_size check (pg_column_size(content) < 1000000)
);

create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc);

create table public.document_shares (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null
    constraint document_shares_user_id_fkey references public.profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index document_shares_user_idx on public.document_shares (user_id);

-- Helpers used by policies. SECURITY DEFINER avoids the classic RLS recursion
-- (documents policy -> shares policy -> documents policy ...).
create or replace function public.is_document_owner(doc_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.documents where id = doc_id and owner_id = auth.uid());
$$;

create or replace function public.shared_role(doc_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.document_shares where document_id = doc_id and user_id = auth.uid();
$$;

-- Keep ownership fixed, bump the version and timestamp on every change.
create or replace function public.documents_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'The owner of a document cannot be changed';
  end if;
  new.version := old.version + 1;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_before_update
  before update on public.documents
  for each row execute function public.documents_before_update();

-- Create a profile for every new auth user. Only the display name comes from
-- user-controlled metadata; nothing security-relevant is read from it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sharing goes through one function so the rules are checked in one place.
create or replace function public.share_document(doc_id uuid, recipient_email text, share_role text default 'editor')
returns public.document_shares
language plpgsql security definer set search_path = public
as $$
declare
  recipient uuid;
  result public.document_shares;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  if share_role is null or share_role not in ('viewer', 'editor') then
    raise exception 'Role must be viewer or editor' using errcode = '22023';
  end if;
  if not public.is_document_owner(doc_id) then
    raise exception 'Only the owner can share this document' using errcode = '42501';
  end if;

  select id into recipient from public.profiles where email = lower(btrim(recipient_email));
  if recipient is null then
    raise exception 'No account found for %', btrim(recipient_email) using errcode = 'P0002';
  end if;
  if recipient = auth.uid() then
    raise exception 'You already own this document' using errcode = '22023';
  end if;

  insert into public.document_shares (document_id, user_id, role)
  values (doc_id, recipient, share_role)
  on conflict (document_id, user_id) do update set role = excluded.role
  returning * into result;
  return result;
end;
$$;

-- Row Level Security --------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

create policy "read own or shared documents" on public.documents
  for select to authenticated
  using (owner_id = auth.uid() or public.shared_role(id) is not null);

create policy "create documents as yourself" on public.documents
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owners and editors update" on public.documents
  for update to authenticated
  using (owner_id = auth.uid() or public.shared_role(id) = 'editor')
  with check (owner_id = auth.uid() or public.shared_role(id) = 'editor');

create policy "owners delete" on public.documents
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "owners and recipients read shares" on public.document_shares
  for select to authenticated
  using (user_id = auth.uid() or public.is_document_owner(document_id));

create policy "owners remove shares" on public.document_shares
  for delete to authenticated
  using (public.is_document_owner(document_id));

-- Emails are visible only to yourself and to people you share documents with.
create policy "read own profile and collaborators" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.document_shares s
      join public.documents d on d.id = s.document_id
      where (d.owner_id = auth.uid() and s.user_id = profiles.id)
         or (s.user_id = auth.uid() and d.owner_id = profiles.id)
    )
  );

-- Privileges: anonymous users get nothing; signed-in users may only write the
-- columns they are meant to write (owner_id, version and timestamps are server-owned).
revoke all on public.profiles, public.documents, public.document_shares from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, delete on public.documents to authenticated;
grant insert (title, content) on public.documents to authenticated;
grant update (title, content) on public.documents to authenticated;
grant select, delete on public.document_shares to authenticated;

revoke execute on function public.share_document(uuid, text, text) from public, anon;
grant execute on function public.share_document(uuid, text, text) to authenticated;
-- Policies call these helpers as the signed-in user, so grant them explicitly
-- instead of relying on project-level default privileges.
grant execute on function public.is_document_owner(uuid), public.shared_role(uuid) to authenticated;
