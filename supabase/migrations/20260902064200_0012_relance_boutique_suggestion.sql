-- Suggestion assistant "relance_boutique" : pas de contact depuis X semaines

alter table public.assistant_suggestions
  add column boutique_id uuid references public.boutiques(id) on delete cascade;

alter table public.assistant_suggestions
  drop constraint assistant_suggestions_type_check;

alter table public.assistant_suggestions
  add constraint assistant_suggestions_type_check
  check (type in ('idee_contenu','observation','relance_boutique'));

create index assistant_suggestions_boutique_idx
  on public.assistant_suggestions (boutique_id);
