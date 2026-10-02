import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { echapper } from './mail-html'
import {
  construireMailAccueil,
  LIBELLE_BOUTON_ACCUEIL,
  lienApp,
  OBJET_ACCUEIL,
  PIED_ACCUEIL,
} from './mail-accueil'
import { MODELE_IMPORT_BASE64, MODELE_IMPORT_NOM } from './modele-import'

const URL_APP = 'https://artisan.braaise.io'

describe('lienApp', () => {
  it('retire la barre oblique finale sans jamais écrire // dans un lien', () => {
    expect(lienApp('https://artisan.braaise.io/')).toBe('https://artisan.braaise.io')
    expect(lienApp('  https://artisan.braaise.io  ')).toBe('https://artisan.braaise.io')
  })

  it('refuse une adresse vide plutôt que de composer un lien muet', () => {
    expect(() => lienApp('')).toThrow(/requise/)
    expect(() => lienApp('   ')).toThrow(/requise/)
  })
})

describe('construireMailAccueil', () => {
  const mail = construireMailAccueil({ urlApp: URL_APP })

  it('donne l’objet du brouillon', () => {
    expect(mail.subject).toBe(OBJET_ACCUEIL)
    expect(mail.subject).toBe('Votre accès à Braaise — par où commencer')
  })

  it('met le lien de l’app dans la version texte, seul sur sa ligne', () => {
    const porteur = mail.text.split('\n').filter((l) => l.includes(URL_APP))
    expect(porteur).toHaveLength(1)
    // Un lien coupé par un retour à la ligne n'est plus reconnu par le lecteur de messages.
    expect(porteur[0].trim()).toBe(URL_APP)
  })

  it('met un vrai bouton cliquable dans la version HTML', () => {
    expect(mail.html).toContain(`<a href="${URL_APP}"`)
    expect(mail.html).toContain(echapper(LIBELLE_BOUTON_ACCUEIL))
  })

  it('porte le pied de page (pourquoi ce mail, et comment répondre)', () => {
    expect(mail.text).toContain(PIED_ACCUEIL)
    expect(mail.html).toContain('Vous recevez ce mail')
  })

  it('dit la liste de ce que Braaise ne fait pas', () => {
    for (const phrase of ['ni facture', 'ni comptabilité', 'ni TVA', 'ni boutique en ligne']) {
      expect(mail.text).toContain(phrase)
      expect(mail.html).toContain(phrase)
    }
  })

  it('produit un HTML complet et bien refermé', () => {
    expect(mail.html.startsWith('<!doctype html>')).toBe(true)
    expect(mail.html).toContain('<html lang="fr">')
    expect(mail.html.trim().endsWith('</html>')).toBe(true)
  })

  it('ne genre jamais le propos : aucune trace du féminin dans le texte', () => {
    const tout = `${mail.subject}\n${mail.text}\n${mail.html}`.toLowerCase()
    expect(tout).not.toMatch(/artisan(e|es)\b/)
  })

  it('joint le modèle d’import, et c’est bien le classeur xlsx', () => {
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe(MODELE_IMPORT_NOM)
    const octets = Buffer.from(mail.attachments[0].base64, 'base64')
    // Un .xlsx est une archive ZIP : les deux premiers octets sont « PK ».
    expect(octets.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(octets.byteLength).toBeGreaterThan(1000)
  })

  it('la pièce jointe et le fichier de public/ sont le MÊME fichier', () => {
    const chemin = fileURLToPath(
      new URL('../../../public/modele-import-braaise.xlsx', import.meta.url),
    )
    const public_ = readFileSync(chemin)
    expect(Buffer.from(MODELE_IMPORT_BASE64, 'base64')).toEqual(public_)
  })

  it('signe avec le prénom quand il est connu, et sans lui sinon', () => {
    expect(construireMailAccueil({ urlApp: URL_APP }).text).toContain('Bonne mise en route,\nBraaise')
    expect(construireMailAccueil({ urlApp: URL_APP, prenom: 'Junior' }).text).toContain(
      'Bonne mise en route,\nJunior, Braaise',
    )
  })
})
