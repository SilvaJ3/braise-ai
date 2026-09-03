import { Fragment, type ReactNode } from 'react'

// Mots-clés à mettre en évidence dans les textes de l'assistant, pour repérer
// l'essentiel (plateforme, échéance, type de contenu) sans tout relire.
const TERMS = [
  "ajoute ça au planning",
  "ajoute ca au planning",
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
  "aujourd'hui",
  'demain',
  'cette semaine',
  'semaine prochaine',
  'instagram',
  'facebook',
  'tiktok',
  'story',
  'stories',
  'reel',
  'reels',
  'post',
  'promo',
  'promotion',
  'nouveauté',
  'nouveautés',
  'boutique',
  'boutiques',
  'dépôt-vente',
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isSingleToken = (s: string) => /^[\p{L}\p{N}-]+$/u.test(s)
const asPattern = (s: string) => (isSingleToken(s) ? `\\b${escapeRe(s)}\\b` : escapeRe(s))

const PATTERN = new RegExp(
  `(${[...TERMS]
    .sort((a, b) => b.length - a.length)
    .map(asPattern)
    .join('|')}|\\d+(?:[.,]\\d+)?\\s?€|\\b\\d+\\s?idée(?:s)?\\b)`,
  'gi',
)

// Découpe un texte et entoure les termes reconnus d'un <mark>, pour une lecture
// plus rapide des réponses de l'assistant (souvent longues).
export function Highlight({ text }: { text: string }): ReactNode {
  const parts = text.split(PATTERN)
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>))}
    </>
  )
}
