// Le mail qui accompagne un bon de dépôt : la version brute ET la version mise en page.
//
// POURQUOI LES DEUX. Jusqu'ici ce mail partait en **version brute seule** : le lien de la boutique
// y était donc du texte au milieu du corps, et le client de messagerie n'en faisait pas un lien.
// Constat de JSB le 27/09/2026, sur le bon n° 2026-009 (Bouquinerie Simone) : « le lien avec le
// token n'est pas cliquable ». La mise en page porte un vrai bouton (une balise `a`, avec le lien
// répété en clair juste dessous). La version brute reste jointe : c'est elle qui s'affiche quand
// le client refuse le HTML, et elle garde au mail son air de mail plutôt que de publipostage.
//
// Ce fichier ne compose rien lui-même : les phrases du brut viennent de `emailBody` (une seule
// source), et la mise en page de `mailHtml`. Ici, seul l'appariement des deux.

import {
  emailBody,
  emailSubject,
  fmtDateLongue,
  fmtEuro,
  labelTotal,
  MODE_MENTION,
  titreBon,
  totalDoc,
  type DepotDoc,
} from './depot-doc.ts'
import { mailHtml } from './mail-html.ts'

export type MailBon = { subject: string; text: string; html: string }

/** Le libellé du bouton, le même partout où le lien d'une boutique est proposé. */
export const LIBELLE_BOUTON = 'Ouvrir ma page'

/** Ce qu'un renvoi dit, et pourquoi : le destinataire doit comprendre qu'il remplace le précédent. */
export const PHRASE_CORRECTION =
  "Correction : dans le mail précédent, le lien de votre page s'affichait en texte simple, et n'était donc pas cliquable. Il l'est maintenant — le bon et le lien sont inchangés, rien d'autre ne change."

/**
 * Le mail complet d'un bon. Sans lien (adresse de boutique introuvable), il part quand même :
 * le bon, lui, existe — mais aucun bouton n'est posé, plutôt qu'un bouton qui ne mène nulle part.
 *
 * `correction: true` = c'est un **renvoi** : même bon, même lien, mais l'objet et la première
 * phrase annoncent qu'il corrige le précédent (constat du 27/09/2026 sur le bon 2026-009).
 */
export function construireMailBon(
  doc: DepotDoc,
  options?: { lien?: string; correction?: boolean },
): MailBon {
  const lien = String(options?.lien ?? '').trim()
  const correction = options?.correction === true
  // La phrase de correction passe devant, dans les deux versions : c'est la première chose à lire.
  const texte = [
    ...(correction ? [PHRASE_CORRECTION, ''] : []),
    emailBody(doc, lien ? { lien } : undefined),
  ].join('\n')

  const reference = `${titreBon(doc.mode)}${doc.numero ? ` n° ${doc.numero}` : ''}`
  const articles = doc.lignes
    .map((l) => `${l.designation} — ${l.quantite} × ${fmtEuro(l.prix_unitaire)}`)
    .join(' · ')
  const contact = [doc.emetteur.nom, doc.emetteur.telephone, doc.emetteur.email].filter(Boolean)

  const paragraphes = [
    ...(correction ? [PHRASE_CORRECTION] : []),
    `Voici ${reference.toLowerCase()} du ${fmtDateLongue(doc.date_depot)} pour ${doc.boutique_nom}, signé, en pièce jointe.`,
    `Articles ${doc.mode === 'achat_ferme' ? 'livrés' : 'déposés'} : ${articles || '—'}`,
    MODE_MENTION[doc.mode],
  ]
  if (doc.notes?.trim()) paragraphes.push(`Note : ${doc.notes.trim()}`)
  // Le lien est en pied de mail, et toujours le même : c'est là que la boutique compte ses pièces.
  if (lien) {
    paragraphes.push(
      `Vos pièces, ce qu'il vous en reste, et vos demandes de réassort : le bouton ci-dessous, ou la même adresse à garder.`,
    )
  }

  const objet = emailSubject(doc)
  return {
    subject: correction ? `Correction — ${objet}` : objet,
    text: texte,
    html: mailHtml({
      expediteur: doc.emetteur.nom,
      titre: reference,
      paragraphes,
      encadre: {
        lignes: [
          ['Boutique', doc.boutique_nom],
          ['Date du dépôt', fmtDateLongue(doc.date_depot)],
          [labelTotal(doc.mode), fmtEuro(totalDoc(doc.lignes))],
        ],
      },
      ...(lien ? { cta: { libelle: LIBELLE_BOUTON, url: lien } } : {}),
      note: lien
        ? "C'est toujours la même adresse — gardez-la."
        : "L'adresse de votre page est en train d'être mise à jour : répondez à ce mail, nous vous la renvoyons.",
      pied: [...contact, 'Pour toute question, répondez simplement à ce message.'].join(' · '),
      resume: `${reference} — ${doc.boutique_nom}`,
    }),
  }
}
