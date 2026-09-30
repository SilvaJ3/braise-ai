-- Le mail d'accueil : le réglage qui l'arme, et l'adresse publique de l'app.
--
--   mail_accueil_actif — 'non' par défaut, délibérément. Le mail existe dans le code, il ne part
--   pas tant que cette ligne ne dit pas 'oui'. Un envoi vers de vraies personnes s'arme par un
--   geste explicite : c'est plus honnête qu'un envoi silencieux au premier déploiement, et ça
--   laisse le temps de relire le texte et de choisir l'adresse de l'app.
--
--   app_url — l'adresse définitive est `artisan.braaise.io` : elle sert déjà le même déploiement
--   que `braise-ai.vercel.app`. Cette valeur est la base des liens d'invitation : tant qu'elle
--   pointe sur l'ancien nom, chaque invitation transmise à quelqu'un porte un nom que personne
--   ne reconnaît.
--
-- Réexécutable : `on conflict do nothing` pour l'insertion, et l'`update` ne touche que la ligne
-- qui n'a pas déjà la bonne valeur.

insert into public.reglages_produit (cle, valeur) values ('mail_accueil_actif', 'non')
on conflict (cle) do nothing;

update public.reglages_produit
   set valeur = 'https://artisan.braaise.io', maj_at = now()
 where cle = 'app_url'
   and valeur <> 'https://artisan.braaise.io';
