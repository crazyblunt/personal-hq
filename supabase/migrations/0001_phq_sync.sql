-- Personal HQ sync storage.
--
-- Devices store encrypted rows here. The server sees only:
--   space       a SHA-256 fingerprint of the private sync code
--   k           an opaque row name (HMAC of the record id)
--   updated_at  when the record last changed
--   payload     AES-GCM ciphertext
-- The table is closed to direct access; the three functions below are the
-- only way in, and each needs the exact space fingerprint.

create sequence if not exists public.phq_sync_seq;

create table if not exists public.phq_sync_rows (
  space text not null check (space ~ '^[0-9a-f]{64}$'),
  k text not null check (char_length(k) between 16 and 64),
  updated_at text not null check (updated_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'),
  payload text not null check (char_length(payload) <= 1048576),
  seq bigint not null default nextval('public.phq_sync_seq'),
  primary key (space, k)
);

create index if not exists phq_sync_rows_space_seq on public.phq_sync_rows (space, seq);

alter table public.phq_sync_rows enable row level security;
revoke all on public.phq_sync_rows from anon, authenticated;
revoke all on sequence public.phq_sync_seq from anon, authenticated;

-- Changes after `p_since`, oldest first.
create or replace function public.phq_sync_pull(p_space text, p_since bigint, p_limit integer default 500)
returns table (k text, u text, p text, seq bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.k, r.updated_at, r.payload, r.seq
  from public.phq_sync_rows r
  where r.space = p_space and r.seq > coalesce(p_since, 0)
  order by r.seq
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

-- Stores rows, keeping whichever copy of each row is newest.
create or replace function public.phq_sync_push(p_space text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming integer;
  existing integer;
begin
  if p_space is null or p_space !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sync space';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;
  incoming := jsonb_array_length(p_rows);
  if incoming > 500 then
    raise exception 'too many rows in one request (max 500)';
  end if;
  select count(*) into existing from public.phq_sync_rows where space = p_space;
  if existing + incoming > 100000 then
    raise exception 'this sync space is full (100,000 rows)';
  end if;

  insert into public.phq_sync_rows as t (space, k, updated_at, payload)
  select p_space, r ->> 'k', r ->> 'u', r ->> 'p'
  from jsonb_array_elements(p_rows) as r
  on conflict (space, k) do update
    set updated_at = excluded.updated_at,
        payload = excluded.payload,
        seq = nextval('public.phq_sync_seq')
    where excluded.updated_at > t.updated_at;
end;
$$;

-- Removes everything stored for one space ("Delete cloud copy").
create or replace function public.phq_sync_delete_space(p_space text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.phq_sync_rows where space = p_space;
$$;

revoke all on function public.phq_sync_pull(text, bigint, integer) from public;
revoke all on function public.phq_sync_push(text, jsonb) from public;
revoke all on function public.phq_sync_delete_space(text) from public;
grant execute on function public.phq_sync_pull(text, bigint, integer) to anon, authenticated;
grant execute on function public.phq_sync_push(text, jsonb) to anon, authenticated;
grant execute on function public.phq_sync_delete_space(text) to anon, authenticated;
