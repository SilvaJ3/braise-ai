-- 0085 — Le code d'invitation est tiré au hasard cryptographique (audit du 05/10/2026, finding 5).
--
-- `invitation_creer` fabriquait ses codes avec `random()`, un générateur non cryptographique : ses
-- sorties successives permettent, en théorie, de prédire les suivantes. Un code d'invitation donne
-- un accès, il doit venir de `gen_random_bytes` (pgcrypto, déjà installé dans `extensions`).
--
-- Le format ne change pas : trois groupes de quatre caractères, même alphabet de 31 signes. Seul le
-- tirage change. Un octet est écarté s'il tomberait dans la dernière tranche incomplète (>= 248, soit
-- 31 × 8) : sans cela, les premiers signes de l'alphabet sortiraient un peu plus souvent que les autres.
-- Le reste de la fonction est celui de 0048, à l'identique.

create or replace function public.invitation_creer(
  p_note text default null,
  p_email text default null,
  p_plan text default 'fondateur',
  p_validite_jours int default 90
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  places_fondateur constant int := 10;
  v_code text;
  v_plan text;
  v_octet int;
begin
  v_plan := coalesce(nullif(trim(coalesce(p_plan, '')), ''), 'fondateur');

  if v_plan = 'fondateur'
     and (
       select count(*) from public.invitations
        where plan = 'fondateur'
          and (used_at is not null or expires_at > now())
     ) >= places_fondateur
  then
    v_plan := 'mensuel';
  end if;

  for essai in 1..50 loop
    v_code := '';
    for groupe in 1..3 loop
      for lettre in 1..4 loop
        loop
          v_octet := get_byte(extensions.gen_random_bytes(1), 0);
          exit when v_octet < 248;
        end loop;
        v_code := v_code || substr(alphabet, 1 + (v_octet % length(alphabet)), 1);
      end loop;
      if groupe < 3 then
        v_code := v_code || '-';
      end if;
    end loop;
    begin
      insert into public.invitations (code, email, plan, note, expires_at)
      values (
        v_code,
        nullif(trim(coalesce(p_email, '')), ''),
        v_plan,
        p_note,
        now() + make_interval(days => greatest(1, coalesce(p_validite_jours, 90)))
      );
      return v_code;
    exception when unique_violation then
      continue;
    end;
  end loop;
  raise exception 'aucun code libre trouvé après 50 essais';
end $$;

revoke all on function public.invitation_creer(text, text, text, int) from public, anon, authenticated;
