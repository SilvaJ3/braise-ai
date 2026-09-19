// Mise en page des mails HTML : un cadre centré, un titre, des paragraphes, et un bouton
// d'action en fin de cadre.
//
// Contraintes du courrier électronique, pas du web : on écrit des tableaux (pas de flexbox), des
// styles en ligne (les feuilles de style sont souvent retirées), et on ne compte sur aucune image
// (beaucoup de clients les bloquent). D'où un en-tête typographique plutôt qu'un logo.
//
// Le texte brut reste joint à chaque envoi : c'est lui qui s'affiche dans un lecteur qui refuse
// le HTML, et il évite à un mail légitime d'avoir l'air d'un mail publicitaire.

/** Échappe ce qui vient de la base ou d'un utilisateur avant de le poser dans le HTML. */
export function echapper(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type Encadre = { lignes: [string, string][] }

export type MailMise = {
  /** Nom affiché en en-tête : le nom commercial de l'expéditeur. */
  expediteur: string
  titre: string
  paragraphes: string[]
  /** Bouton d'action, en fin de cadre. Sans lui, pas de bouton. */
  cta?: { libelle: string; url: string }
  /** Petit tableau de détails (dates, quantités, adresse…). */
  encadre?: Encadre
  /** Dernière ligne du cadre, en petit et en gris : ce qu'il ne faut pas rater. */
  note?: string
  /** Ligne sous le cadre, hors carte : mention légale, adresse, pourquoi ce mail. */
  pied?: string
  /** Résumé invisible, affiché par la boîte mail à côté de l'objet. */
  resume?: string
}

// Palette reprise du produit : fond chaud, carte blanche, accent bleu de l'app.
const FOND = '#f4f1ea'
const CARTE = '#fffdfa'
const BORD = '#e6dfd3'
const TEXTE = '#2f2c28'
const DOUX = '#6f6861'
const ACCENT = '#4a7396'

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const SERIF = "Georgia,'Times New Roman',serif"

/**
 * Le mail HTML complet. Structure : fond → carte centrée de 600 px → en-tête, titre,
 * paragraphes, encadré, bouton, note → pied hors carte.
 */
export function mailHtml(m: MailMise): string {
  const paragraphes = m.paragraphes
    .map(
      (p) =>
        `<tr><td style="padding:0 32px 14px;font-family:${SANS};font-size:16px;line-height:1.6;color:${TEXTE};">${echapper(p)}</td></tr>`,
    )
    .join('')

  const encadre = m.encadre?.lignes.length
    ? `<tr><td style="padding:4px 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#faf7f2;border:1px solid ${BORD};border-radius:10px;">
          ${m.encadre.lignes
            .map(
              ([cle, valeur]) =>
                `<tr>
                   <td style="padding:11px 14px;font-family:${SANS};font-size:13px;line-height:1.4;color:${DOUX};white-space:nowrap;vertical-align:top;">${echapper(cle)}</td>
                   <td style="padding:11px 14px;font-family:${SANS};font-size:15px;line-height:1.4;color:${TEXTE};font-weight:600;">${echapper(valeur)}</td>
                 </tr>`,
            )
            .join('')}
        </table>
      </td></tr>`
    : ''

  // Bouton en tableau : les liens stylés en ligne sont rognés par Outlook, une cellule ne l'est pas.
  const cta = m.cta
    ? `<tr><td style="padding:6px 32px 26px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
          <tr>
            <td align="center" bgcolor="${ACCENT}" style="border-radius:10px;">
              <a href="${echapper(m.cta.url)}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${echapper(m.cta.libelle)}</a>
            </td>
          </tr>
        </table>
        <div style="margin-top:12px;font-family:${SANS};font-size:13px;line-height:1.5;color:${DOUX};">
          ou copie ce lien : <span style="color:${ACCENT};word-break:break-all;">${echapper(m.cta.url)}</span>
        </div>
      </td></tr>`
    : ''

  const note = m.note
    ? `<tr><td style="padding:0 32px 24px;font-family:${SANS};font-size:13px;line-height:1.55;color:${DOUX};">${echapper(m.note)}</td></tr>`
    : ''

  const pied = m.pied
    ? `<tr><td align="center" style="padding:18px 8px 0;font-family:${SANS};font-size:12px;line-height:1.55;color:${DOUX};">${echapper(m.pied)}</td></tr>`
    : ''

  // Résumé invisible : il ne doit rien laisser dans le corps du mail (d'où les zéros de hauteur).
  const resume = m.resume
    ? `<div style="display:none;font-size:1px;color:${FOND};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${echapper(m.resume)}</div>`
    : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${echapper(m.titre)}</title>
</head>
<body style="margin:0;padding:0;background:${FOND};">
${resume}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOND};">
  <tr>
    <td align="center" style="padding:30px 12px 34px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${CARTE};border:1px solid ${BORD};border-radius:16px;">
        <tr>
          <td style="padding:28px 32px 6px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${DOUX};">${echapper(m.expediteur)}</td>
        </tr>
        <tr>
          <td style="padding:0 32px 18px;font-family:${SERIF};font-size:25px;line-height:1.25;color:${TEXTE};">${echapper(m.titre)}</td>
        </tr>
        ${paragraphes}
        ${encadre}
        ${cta}
        ${note}
      </table>
      ${pied}
    </td>
  </tr>
</table>
</body>
</html>`
}
