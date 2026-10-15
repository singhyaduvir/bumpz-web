create type public.submission_status as enum (
  'uploaded',
  'rated',
  'needs_review',
  'analysis_failed',
  'complete',
  'rejected'
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  image_path text not null unique,
  location_text text not null check (char_length(location_text) between 3 and 300),
  city text not null check (char_length(city) between 1 and 100),
  state char(2) not null check (state in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY'
  )),
  neighborhood text,
  intersection text,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  geocode_confidence real check (geocode_confidence is null or geocode_confidence between 0 and 1),
  paser_rating smallint check (paser_rating is null or paser_rating between 1 and 10),
  rating_confidence text check (rating_confidence is null or rating_confidence in ('low', 'medium', 'high')),
  distresses jsonb not null default '[]'::jsonb,
  rationale text,
  status public.submission_status not null default 'uploaded',
  flag_count integer not null default 0 check (flag_count >= 0),
  model_version text,
  paser_definitions_version text not null,
  ip_hash char(64),
  constraint submission_coordinates_together check ((lat is null) = (lng is null)),
  constraint complete_submission_has_coordinates check (status <> 'complete' or (lat is not null and lng is not null)),
  constraint complete_submission_has_rating check (
    status <> 'complete' or (paser_rating is not null and rating_confidence is not null)
  )
);

create index submissions_map_bounds_idx on public.submissions (lat, lng)
  where status = 'complete' and lat is not null and lng is not null;
create index submissions_rate_limit_idx on public.submissions (ip_hash, created_at);
create index submissions_created_at_idx on public.submissions (created_at desc);
grant all on public.submissions to service_role;

create table public.submission_rate_events (
  ip_hash char(64) not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index submission_rate_events_ip_created_idx
  on public.submission_rate_events (ip_hash, created_at);
create index submission_rate_events_created_idx
  on public.submission_rate_events (created_at);

alter table public.submission_rate_events enable row level security;
revoke all on public.submission_rate_events from public, anon, authenticated;
grant all on public.submission_rate_events to service_role;

alter table public.submissions enable row level security;

grant select (
  id, created_at, location_text, city, state, neighborhood, intersection,
  lat, lng, geocode_confidence, paser_rating, rating_confidence, distresses,
  rationale, status, flag_count, model_version, paser_definitions_version
) on public.submissions to anon, authenticated;

create policy "Public can read completed submissions"
  on public.submissions for select
  to anon, authenticated
  using (status = 'complete');

grant insert (
  image_path, location_text, city, state, neighborhood, intersection,
  paser_definitions_version
) on public.submissions to anon, authenticated;

create policy "Public can submit an unlocated photo record"
  on public.submissions for insert
  to anon, authenticated
  with check (
    status = 'uploaded'
    and lat is null
    and lng is null
    and paser_rating is null
    and flag_count = 0
    and ip_hash is null
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('road-photos', 'road-photos', false, 15728640, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.increment_submission_flag(submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  update public.submissions
  set flag_count = flag_count + 1
  where id = submission_id and status = 'complete'
  returning flag_count into new_count;
  if new_count is null then
    raise exception 'Submission not found';
  end if;
  return new_count;
end;
$$;

revoke all on function public.increment_submission_flag(uuid) from public, anon, authenticated;
grant execute on function public.increment_submission_flag(uuid) to service_role;

create or replace function public.claim_submission_slot(requested_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if requested_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid IP hash';
  end if;
  perform pg_advisory_xact_lock(hashtext(requested_ip_hash));
  delete from public.submission_rate_events
  where created_at < now() - interval '24 hours';
  delete from public.submission_rate_events
  where ip_hash = requested_ip_hash::char(64)
    and created_at < now() - interval '1 hour';
  select count(*) into recent_count
  from public.submission_rate_events
  where ip_hash = requested_ip_hash::char(64)
    and created_at >= now() - interval '1 hour';
  if recent_count >= 10 then
    return false;
  end if;
  insert into public.submission_rate_events (ip_hash) values (requested_ip_hash);
  return true;
end;
$$;

revoke all on function public.claim_submission_slot(text) from public, anon, authenticated;
grant execute on function public.claim_submission_slot(text) to service_role;
