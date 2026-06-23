create extension if not exists vector with schema extensions;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.memories
  add column if not exists space_id uuid references public.spaces(id) on delete set null,
  add column if not exists topic text,
  add column if not exists confidence_score integer not null default 50,
  add column if not exists confidence_status text not null default 'new',
  add column if not exists review_count integer not null default 0,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists review_due_at timestamptz,
  add column if not exists needs_review boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'memories_confidence_score_range'
  ) then
    alter table public.memories
      add constraint memories_confidence_score_range
      check (confidence_score between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'memories_confidence_status_valid'
  ) then
    alter table public.memories
      add constraint memories_confidence_status_valid
      check (confidence_status in ('new', 'learning', 'needs_review', 'strong', 'mastered'));
  end if;
end;
$$;

create table if not exists public.memory_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  space_id uuid references public.spaces(id) on delete set null,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table if not exists public.memory_topic_links (
  memory_id uuid not null references public.memories(id) on delete cascade,
  topic_id uuid not null references public.memory_topics(id) on delete cascade,
  relation text not null default 'primary',
  created_at timestamptz not null default now(),
  primary key (memory_id, topic_id)
);

create table if not exists public.memory_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_memory_id uuid not null references public.memories(id) on delete cascade,
  target_memory_id uuid not null references public.memories(id) on delete cascade,
  relation_type text not null,
  strength double precision not null default 0.5,
  reason text,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);

alter table public.memory_relations
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution text;

create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  memory_id uuid references public.memories(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  space_id uuid references public.spaces(id) on delete set null,
  week_start date not null,
  summary text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists weekly_summaries_user_space_week_uidx
  on public.weekly_summaries (user_id, coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);

create index if not exists spaces_user_name_idx
  on public.spaces (user_id, name);

create index if not exists memories_user_space_created_at_idx
  on public.memories (user_id, space_id, created_at desc);

create index if not exists memories_user_topic_idx
  on public.memories (user_id, topic);

create index if not exists memories_user_needs_review_idx
  on public.memories (user_id, needs_review)
  where needs_review = true and archived_at is null;

create index if not exists memories_user_confidence_idx
  on public.memories (user_id, confidence_status, confidence_score);

create index if not exists memories_user_archived_idx
  on public.memories (user_id, archived_at);

create index if not exists memory_topics_user_normalized_idx
  on public.memory_topics (user_id, normalized_name);

create index if not exists memory_topic_links_topic_idx
  on public.memory_topic_links (topic_id);

create index if not exists memory_relations_source_idx
  on public.memory_relations (source_memory_id);

create index if not exists memory_relations_target_idx
  on public.memory_relations (target_memory_id);

create index if not exists memory_relations_user_type_idx
  on public.memory_relations (user_id, relation_type, created_at desc);

create index if not exists memory_relations_user_unresolved_idx
  on public.memory_relations (user_id, relation_type, created_at desc)
  where resolved_at is null;

create index if not exists memory_events_user_created_at_idx
  on public.memory_events (user_id, created_at desc);

create index if not exists memory_events_memory_created_at_idx
  on public.memory_events (memory_id, created_at desc);

drop trigger if exists set_memories_updated_at on public.memories;
create trigger set_memories_updated_at
  before update on public.memories
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_spaces_updated_at on public.spaces;
create trigger set_spaces_updated_at
  before update on public.spaces
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_memory_topics_updated_at on public.memory_topics;
create trigger set_memory_topics_updated_at
  before update on public.memory_topics
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_weekly_summaries_updated_at on public.weekly_summaries;
create trigger set_weekly_summaries_updated_at
  before update on public.weekly_summaries
  for each row
  execute function public.set_updated_at();

insert into public.spaces (user_id, name, description)
values
  ('54ad7274-ddff-4727-9ca0-84097b044c11', 'General', 'Default catch-all space'),
  ('54ad7274-ddff-4727-9ca0-84097b044c11', 'AI', 'AI, machine learning, and learning systems'),
  ('54ad7274-ddff-4727-9ca0-84097b044c11', 'Coding', 'Programming, software design, and debugging'),
  ('54ad7274-ddff-4727-9ca0-84097b044c11', 'Career', 'Career planning, interviews, and work notes'),
  ('54ad7274-ddff-4727-9ca0-84097b044c11', 'Personal', 'Personal notes and life context')
on conflict (user_id, name) do nothing;

update public.memories
set space_id = spaces.id
from public.spaces
where memories.user_id = '54ad7274-ddff-4727-9ca0-84097b044c11'
  and memories.space_id is null
  and spaces.user_id = memories.user_id
  and spaces.name = 'General';

create or replace function public.match_memories_v2(
  query_embedding extensions.vector(1536),
  match_threshold double precision,
  match_count integer,
  filter_user_id uuid,
  filter_space_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  memory_type text,
  tags text[],
  source text,
  space_id uuid,
  topic text,
  confidence_score integer,
  confidence_status text,
  needs_review boolean,
  archived_at timestamptz,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    memories.id,
    memories.user_id,
    memories.title,
    memories.body,
    memories.memory_type,
    memories.tags,
    memories.source,
    memories.space_id,
    memories.topic,
    memories.confidence_score,
    memories.confidence_status,
    memories.needs_review,
    memories.archived_at,
    memories.created_at,
    1 - (memory_vectors.embedding <=> query_embedding) as similarity
  from public.memory_vectors
  join public.memories on memories.id = memory_vectors.memory_id
  where memories.user_id = filter_user_id
    and (filter_space_id is null or memories.space_id = filter_space_id)
    and memories.archived_at is null
    and 1 - (memory_vectors.embedding <=> query_embedding) > match_threshold
  order by memory_vectors.embedding <=> query_embedding
  limit match_count;
$$;

grant all on table public.spaces to anon, authenticated;
grant all on table public.memory_topics to anon, authenticated;
grant all on table public.memory_topic_links to anon, authenticated;
grant all on table public.memory_relations to anon, authenticated;
grant all on table public.memory_events to anon, authenticated;
grant all on table public.weekly_summaries to anon, authenticated;
grant execute on function public.match_memories_v2(extensions.vector, double precision, integer, uuid, uuid)
  to anon, authenticated;

alter table public.spaces disable row level security;
alter table public.memory_topics disable row level security;
alter table public.memory_topic_links disable row level security;
alter table public.memory_relations disable row level security;
alter table public.memory_events disable row level security;
alter table public.weekly_summaries disable row level security;
