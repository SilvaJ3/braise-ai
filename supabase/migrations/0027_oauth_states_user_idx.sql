-- Advisor : FK sans index sur oauth_states.user_id.
create index oauth_states_user_idx on public.oauth_states (user_id);
