-- 0079 — Deux nouveaux messages à l'artisan : « ton stock a bougé » et « tu peux facturer ».
--
-- Le trou : `0068` a ouvert le canal (push + mail, trace séparée par canal) mais pour deux
-- événements seulement, `bon_confirme` et `reassort`. Deux autres gestes de la boutique engagent
-- la suite et se font sans rendez-vous :
--
--   1. `boutique_declarer` — la boutique déclare ce qu'elle a vendu. C'est un mouvement de stock :
--      les pièces sortent. L'artisan l'apprend aujourd'hui en ouvrant l'app. Un message
--      « mouvement de stock » le lui dit tout de suite, AVEC UN COOLDOWN de cinq minutes
--      par (artisan, boutique) : trois déclarations dans l'heure ne font pas trois messages.
--   2. `releve_emettre` — un relevé facturable est émis. Un document existe, pour une période
--      donnée, et on peut facturer. C'est le mail « tu peux facturer, du … au … ».
--
-- Le cooldown vit dans `reglages_produit` (clé `cooldown_stock:<user>:<boutique>`) : une table pour
-- une seule information serait du poids mort, et cette clé se purge d'un `delete`.

-- --- 1. Le type s'élargit ---------------------------------------------------------------------
alter table public.notifications_artisan
  drop constraint if exists notifications_artisan_type_check;
alter table public.notifications_artisan
  add constraint notifications_artisan_type_check
  check (type in ('bon_confirme', 'reassort', 'stock_mouvement', 'releve_emis'));

-- --- 2. La fonction accepte les nouveaux types -------------------------------------------------
create or replace function public.notifier_artisan(p_user uuid, p_type text, p_ref jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_secret text;
begin
  if p_user is null or p_type is null
     or p_type not in ('bon_confirme', 'reassort', 'stock_mouvement', 'releve_emis') then
    return null;
  end if;

  insert into public.notifications_artisan (user_id, type, ref)
  values (p_user, p_type, coalesce(p_ref, '{}'::jsonb))
  returning id into v_id;

  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'assistant_cron_secret';
    if v_secret is not null then
      perform net.http_post(
        url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/notifications-artisan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', v_secret
        ),
        body := jsonb_build_object('mode', 'traiter', 'id', v_id),
        timeout_milliseconds := 30000
      );
    end if;
  exception when others then
    null;
  end;

  return v_id;
end;
$function$;

-- --- 3. Le mouvement de stock, avec son cooldown ------------------------------------------------
-- Le cooldown vit dans sa propre table, pas dans `reglages_produit` : la clé d'un couple
-- (artisan, boutique) dépasse les 40 caractères que cette table accepte, et un anti-doublon n'est
-- pas un réglage. La table se purge toute seule au passage.
create table if not exists public.notifications_cooldown (
  cle text primary key check (char_length(cle) between 2 and 120),
  vu_le timestamptz not null default now()
);
alter table public.notifications_cooldown enable row level security;
comment on table public.notifications_cooldown is
  'Anti-doublon des notifications : une clé vue il y a moins de N minutes ne renotifie pas.';

create or replace function public.notifier_stock_mouvement(
  p_user uuid, p_boutique uuid, p_declaration uuid,
  p_facturable numeric, p_nb_lignes int, p_periode date
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cle text;
  v_vu timestamptz;
  v_ref jsonb;
begin
  if p_user is null or p_boutique is null then return null; end if;

  v_cle := 'stock|' || p_user::text || '|' || p_boutique::text;

  select vu_le into v_vu from public.notifications_cooldown where cle = v_cle;

  -- Trois déclarations dans l'heure ne font pas trois messages.
  if v_vu is not null and v_vu > now() - interval '5 minutes' then
    return null;
  end if;

  insert into public.notifications_cooldown (cle, vu_le) values (v_cle, now())
  on conflict (cle) do update set vu_le = now();

  -- Ménage : une clé vue il y a plus d'un jour ne sert plus à rien.
  delete from public.notifications_cooldown where vu_le < now() - interval '1 day';

  v_ref := jsonb_build_object(
    'declaration_id', p_declaration,
    'boutique_id', p_boutique,
    'facturable', coalesce(p_facturable, 0),
    'nb_lignes', coalesce(p_nb_lignes, 0),
    'periode', p_periode
  );

  return public.notifier_artisan(p_user, 'stock_mouvement', v_ref);
end;
$function$;

-- --- 4. `boutique_declarer` déclenche -----------------------------------------------------------
do $maj$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.boutique_declarer(text, uuid, jsonb, text)'::regprocedure);

  if position('notifier_stock_mouvement' in v_def) > 0 then
    raise notice 'boutique_declarer notifie deja';
    return;
  end if;

  v_def := replace(
    v_def,
    'return jsonb_build_object(''ok'', true, ''declaration_id'', v_id, ''periode'', v_periode,',
    $ins$begin
    perform public.notifier_stock_mouvement(
      v_user, v_boutique, v_id, v_total, jsonb_array_length(v_propre), v_periode);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'periode', v_periode,$ins$
  );

  if position('notifier_stock_mouvement' in v_def) = 0 then
    raise exception 'boutique_declarer : motif de remplacement introuvable, rien applique';
  end if;

  execute v_def;
end
$maj$;

-- --- 5. `releve_emettre` déclenche --------------------------------------------------------------
do $maj2$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.releve_emettre(uuid)'::regprocedure);

  if position('notifier_artisan' in v_def) > 0 then
    raise notice 'releve_emettre notifie deja';
    return;
  end if;

  v_def := replace(
    v_def,
    'return v_apercu || jsonb_build_object(''ok'', true, ''releve_id'', v_id, ''numero'', v_numero)',
    $ins2$begin
    perform public.notifier_artisan(
      v_user, 'releve_emis',
      jsonb_build_object(
        'releve_id', v_id, 'numero', v_numero, 'boutique_id', p_boutique,
        'periode_debut', v_apercu->>'periode_debut',
        'periode_fin', v_apercu->>'periode_fin',
        'total_ventes', v_apercu->>'total_ventes',
        'nb_declarations', v_apercu->>'nb_declarations'));
  exception when others then null;
  end;

  return v_apercu || jsonb_build_object('ok', true, 'releve_id', v_id, 'numero', v_numero)$ins2$
  );

  if position('notifier_artisan' in v_def) = 0 then
    raise exception 'releve_emettre : motif de remplacement introuvable, rien applique';
  end if;

  execute v_def;
end
$maj2$;

-- --- 6. Permissions ----------------------------------------------------------------------------
revoke all on function public.notifier_stock_mouvement(uuid, uuid, uuid, numeric, int, date)
  from public, anon, authenticated;
grant execute on function public.notifier_stock_mouvement(uuid, uuid, uuid, numeric, int, date)
  to service_role;

revoke all on function public.notifier_artisan(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.notifier_artisan(uuid, text, jsonb) to service_role;
