-- The current app does not authenticate users; it sends a hard-coded user_id
-- from the client. Keep RLS disabled until the app is updated to use auth.
grant usage on schema public to anon, authenticated;
grant all on table public.memories to anon, authenticated;
grant all on table public.memory_vectors to anon, authenticated;
grant all on table public.chat_sessions to anon, authenticated;
grant all on table public.chat_messages to anon, authenticated;
grant usage, select on sequence public.chat_messages_message_order_seq to anon, authenticated;

alter table public.memories disable row level security;
alter table public.memory_vectors disable row level security;
alter table public.chat_sessions disable row level security;
alter table public.chat_messages disable row level security;
