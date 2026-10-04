// Le compte de démonstration : la règle des envois, écrite une seule fois.
//
// Décision de JSB (02/10/2026) : deux choses différentes portaient le même nom.
//
//  · le COMPTE DE DÉMONSTRATION (`demo`) — l'outil qu'on montre à quelqu'un. Il ne doit RIEN envoyer
//    à un tiers : ni un bon de dépôt, ni un renvoi. Les destinataires d'une boutique sont remplacés
//    par l'adresse du propriétaire du compte, qui voit ainsi ce qui serait parti, et le mail le dit.
//    C'est un environnement de démonstration, pas un client.
//
//  · le COMPTE DE TEST (`est_test`) — gratuit, marqué comme testeur, et destiné à devenir un compte
//    utilisateur. Lui envoie normalement : rendre un testeur muet lui ferait croire que l'app est
//    cassée, et la mise en service deviendrait une surprise au premier bon réel.
//
// Le drapeau `demo` porte donc la redirection ; `est_test` continue de porter l'accès gratuit. Ce
// fichier ne connaît ni le réseau ni la base : il décide, et les fonctions d'envoi l'appliquent.

/** Où part un message, et ce qui a été écarté pour le rediriger. */
export type Destinataires = {
  to: string[]
  cc: string[]
  /** Les adresses réellement visées, quand elles ont été remplacées. Vide = rien n'a été redirigé. */
  redirige: string[]
}

const normalise = (e: string) => e.trim().toLowerCase()

/**
 * Les destinataires d'un message, compte de démonstration compris.
 *
 * Un compte de démonstration sans adresse connue laisse le message tel quel : on ne remplace pas des
 * destinataires par rien. De même quand il n'écrit qu'à lui-même — il n'y a alors rien à écarter, et
 * une phrase de redirection serait un mensonge.
 */
export function destinatairesDeCompte(
  demo: boolean | null | undefined,
  adresseCompte: string | null | undefined,
  to: string[],
  cc: string[] = [],
): Destinataires {
  const compte = normalise(String(adresseCompte ?? ''))
  if (!demo || !compte) return { to, cc, redirige: [] }

  const vises = [...to, ...cc].filter((e) => {
    const a = normalise(e)
    return a !== '' && a !== compte
  })
  if (!vises.length) return { to, cc, redirige: [] }

  return { to: [compte], cc: [], redirige: vises }
}

/**
 * La phrase qui accompagne un message redirigé — la même dans la version brute et dans la version
 * mise en page. Elle dit les trois choses utiles : c'est une démonstration, qui était visé, et que
 * personne d'autre n'a rien reçu.
 */
export function mentionDemo(vises: string[]): string {
  const liste = vises.join(', ')
  return `Compte de démonstration : ce message était destiné à ${liste}. Il n'est envoyé qu'à toi — aucun mail ne part vers une boutique depuis ce compte.`
}
