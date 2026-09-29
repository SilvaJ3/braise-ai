import { Link } from 'react-router-dom'
import { CONFIDENTIALITE, CONDITIONS } from '../content/legal'
import { estProvisoire, sections } from '../lib/texte-legal'

/**
 * Une page légale : le même écran pour les conditions et la confidentialité, parce que c'est le
 * même document à lire — seul le texte change. Le format est posé une fois (sections, puces,
 * paragraphes) dans `livre` ci-dessous, jamais dans le texte.
 *
 * Pourquoi ces pages existent dans l'application et pas seulement sur la vitrine : c'est ici qu'on
 * demande à quelqu'un d'accepter les conditions, à l'inscription. Une case à cocher qui renvoie
 * vers une page introuvable ne vaut pas mieux que pas de case du tout.
 */
export default function PageLegale({ document }: { document: 'conditions' | 'confidentialite' }) {
  const texte = document === 'conditions' ? CONDITIONS : CONFIDENTIALITE
  const titre = document === 'conditions' ? 'Conditions générales' : 'Confidentialité'
  const provisoire = estProvisoire(texte)

  const livre = sections(texte)
  let cle = 0

  return (
    <>
      <Link to="/" className="link" style={{ marginBottom: 8, display: 'inline-block' }}>
        ← Retour
      </Link>
      <h1>{titre}</h1>

      {/* Tant qu'un crochet subsiste dans le texte (identité de l'éditeur, contact), la page le
          dit. Publier une page légale sans éditeur serait pire que ne pas en avoir : elle aurait
          l'air d'exister. */}
      {provisoire && (
        <div className="banner">
          <p style={{ margin: 0 }}>
            Version provisoire : les mentions entre crochets (identité de l'éditeur, contact) seront
            complétées avant la mise en ligne.
          </p>
        </div>
      )}

      {livre.map((section) => (
        <section key={`s${cle++}`} style={{ marginTop: 18 }}>
          {section.titre && <h2 style={{ marginBottom: 6 }}>{section.titre}</h2>}
          {section.blocs.map((bloc, i) =>
            bloc.type === 'point' ? (
              <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
                <span className="muted">—</span>
                <span>{bloc.texte}</span>
              </div>
            ) : (
              <p key={i} style={{ margin: '6px 0' }}>
                {bloc.texte}
              </p>
            ),
          )}
        </section>
      ))}

      <p className="muted" style={{ marginTop: 24, fontSize: '0.85rem' }}>
        Une question sur ce document ? Écris-nous : <a href="mailto:contact@braaise.io">contact@braaise.io</a>.
      </p>
    </>
  )
}
