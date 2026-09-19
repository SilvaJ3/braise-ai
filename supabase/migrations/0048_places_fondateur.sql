-- 0048 — Les places de fondateur sont comptées (la promesse des dix premiers).
--
-- Constat du 19/09/2026 : l'edge function `demande-acces` créait chaque invitation avec
-- `p_plan = 'fondateur'`, sans jamais compter. La promesse « 29 €/mois, prix bloqué 2 ans, pour les
-- 10 premiers comptes » n'était donc pas tenue par le code : la 11e invitation, et la 50e, donnaient
-- encore le tarif fondateur.
--
-- Le comptage est fait ici, dans la fonction qui crée l'invitation : c'est le seul endroit où la
-- décision peut être **atomique**. Deux invitations créées au même instant ne peuvent pas se voir
-- attribuer la même place.
--
-- Une place est prise par une invitation fondateur **vivante** :
--   · utilisée  → elle porte le prix sur un compte, la place reste prise pour toujours ;
--   · encore valable → elle peut encore l'être.
-- Une invitation **expirée et jamais utilisée** rend sa place : c'est le seul cas où le compteur
-- redescend, et c'est voulu — sinon un code oublié brûlerait une place à vie.
--
-- Aucun changement de signature : l'appelant demande toujours « le meilleur plan disponible ».
-- Un plan explicitement demandé (mensuel, annuel) n'est jamais touché.

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
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
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
