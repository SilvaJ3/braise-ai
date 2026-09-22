-- 0040 — Le mot d'accueil appartient au compte, plus au code.
--
-- « Gne Gne Gne Je t'aime Gne Gne Gne » était écrit en dur dans l'écran d'accueil : c'était
-- volontaire (message affectueux d'Alexandra, commit e172d7b), mais depuis que l'app sert
-- plusieurs comptes, chaque nouvel artisan lisait la déclaration de quelqu'un d'autre. Le mot
-- devient une colonne : vide par défaut, remplie par qui veut.

alter table public.assistant_profil
  add column if not exists message_accueil text;

alter table public.assistant_profil
  add constraint assistant_profil_message_accueil_len
    check (message_accueil is null or char_length(message_accueil) <= 200);

-- Le mot existant est reversé sur le compte qui l'a écrit : rien ne disparaît pour elle, et le
-- prochain compte neuf ne le verra pas.
update public.assistant_profil p
   set message_accueil = 'Gne Gne Gne Je t''aime Gne Gne Gne'
  from auth.users u
 where u.id = p.user_id
   and u.email = 'alexandra.mnier@gmail.com'
   and p.message_accueil is null;
