import { describe, expect, it } from 'vitest'
// Le fichier est lu par Vite (`?raw`) : il reste hors de `src/`, et le test n'a besoin ni d'accès au
// disque ni des types Node, que ce projet n'embarque pas.
import page from '../../public/boutique/index.html?raw'

/**
 * La page de la boutique est un fichier statique, hors de `src/` : rien ne la compile et rien ne la
 * monte. Ces vérifications tiennent le contrat que la page et la base partagent, celui qui casse en
 * silence — les crochets que le script cherche dans son propre HTML, et la pièce du catalogue.
 *
 * Elles ne remplacent pas un essai dans un navigateur : elles empêchent seulement de supprimer un
 * bloc sans s'en apercevoir.
 */
describe('page boutique (public/boutique/index.html)', () => {
  it('propose les pièces du catalogue de l’artisan, en plus de celles déjà reçues', () => {
    expect(page).toContain('id="ajouter-piece"')
    expect(page).toContain('${catalogue.length ?')
    expect(page).toContain('data-nom=')
  })

  it('ajoute une ligne de réassort avec les mêmes crochets que les pièces reçues', () => {
    expect(page).toContain('function ligneCommande(')
    expect(page).toContain('function ajouterPiece(')
    expect(page).toContain('function viderDemande(')
    expect(page).toContain('id="lignes-commande"')
    expect(page).toContain('data-role="demande"')
  })

  it('branche le sélecteur sur la page, et tolère son absence', () => {
    expect(page).toContain("if (ajout) ajout.addEventListener('change'")
  })

  it("n'exige pas de bouton « Envoyer mon relevé » quand il n'y a rien à compter", () => {
    expect(page).toContain("const boutonEnvoi = $('envoyer')")
    expect(page).toContain('if (boutonEnvoi) boutonEnvoi.addEventListener')
  })

  it('ne demande jamais deux fois la même pièce dans un même envoi', () => {
    expect(page).toContain('option.disabled = true')
    expect(page).toContain('option.disabled = false')
  })

  it('n’envoie que des quantités strictement positives', () => {
    expect(page).toContain('q <= 0) continue')
  })
})
