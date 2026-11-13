import { useMemo, useState } from 'react'
import { epargneParObjectif, suiviObjectif } from '../lib/calculs'
import {
  accordDonne,
  demanderConseil,
  donnerAccord,
  donneesBilan,
  donneesDepense,
  donneesObjectif,
  preAnalyser,
  type TypeDemande,
} from '../lib/conseiller'
import { formaterMontant } from '../lib/format'
import type { Donnees } from '../lib/hooks'
import type { Utilisateur } from '../types'

const ONGLETS: { type: TypeDemande; libelle: string }[] = [
  { type: 'bilan', libelle: 'Bilan' },
  { type: 'objectif', libelle: 'Objectif' },
  { type: 'depense', libelle: 'Dépense' },
]

function lireMontant(texte: string): number {
  const n = Number(texte.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

/** Affiche la réponse : paragraphes, et listes pour les lignes qui commencent par un tiret. */
function Reponse({ texte }: { texte: string }) {
  const blocs: { liste: boolean; lignes: string[] }[] = []
  for (const brute of texte.split('\n')) {
    const ligne = brute.trim().replace(/\*\*/g, '')
    if (!ligne) continue
    const puce = /^[-•*]\s+/.test(ligne)
    const contenu = ligne.replace(/^[-•*]\s+/, '')
    const dernier = blocs[blocs.length - 1]
    if (puce && dernier?.liste) dernier.lignes.push(contenu)
    else blocs.push({ liste: puce, lignes: [contenu] })
  }
  return (
    <div className="reponse">
      {blocs.map((b, i) =>
        b.liste ? (
          <ul key={i}>
            {b.lignes.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.lignes[0]}</p>
        ),
      )}
    </div>
  )
}

export default function Conseiller(props: { profil: Utilisateur; donnees: Donnees; fermer: () => void }) {
  const { profil, donnees, fermer } = props
  const argent = (m: number) => formaterMontant(m, profil.devise)

  const [accord, setAccord] = useState(accordDonne)
  const [type, setType] = useState<TypeDemande>('bilan')
  const [enCours, setEnCours] = useState(false)
  const [reponse, setReponse] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const objectifsOuverts = useMemo(() => {
    const epargne = epargneParObjectif(donnees.transactions)
    return donnees.objectifs.filter((o) => !suiviObjectif(o, epargne.get(o.id) ?? 0).atteint)
  }, [donnees.objectifs, donnees.transactions])
  const [objectifId, setObjectifId] = useState(objectifsOuverts[0]?.id ?? '')

  const [montant, setMontant] = useState('')
  const [categorieId, setCategorieId] = useState(donnees.categories[0]?.id ?? '')
  const [projetId, setProjetId] = useState('')
  const projetsOuverts = donnees.projets.filter((p) => p.statut === 'en_cours')

  const depense = { montant: lireMontant(montant), categorieId: categorieId || null, projetId: projetId || null }
  const analyse = useMemo(
    () => (depense.montant > 0 ? preAnalyser(donnees, depense) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [donnees, depense.montant, depense.categorieId, depense.projetId],
  )

  function changerOnglet(t: TypeDemande) {
    setType(t)
    setReponse(null)
    setErreur(null)
  }

  async function demander() {
    setEnCours(true)
    setReponse(null)
    setErreur(null)
    try {
      if (type === 'bilan') {
        setReponse(await demanderConseil('bilan', donneesBilan(profil, donnees)))
      } else if (type === 'objectif') {
        const objectif = objectifsOuverts.find((o) => o.id === objectifId)
        if (!objectif) throw new Error('Choisissez un objectif.')
        setReponse(await demanderConseil('objectif', donneesObjectif(profil, donnees, objectif)))
      } else {
        if (!analyse) throw new Error('Entrez le montant de la dépense.')
        setReponse(await demanderConseil('depense', donneesDepense(profil, donnees, depense, analyse)))
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="voile" onClick={fermer}>
      <div className="feuille formulaire" onClick={(e) => e.stopPropagation()}>
        <div className="entete">
          <h2>Conseiller</h2>
          <button type="button" className="icone-bouton" onClick={fermer} aria-label="Fermer">
            ✕
          </button>
        </div>

        {!accord ? (
          <>
            <p>
              Le conseiller commente vos chiffres à l'aide d'une intelligence artificielle. Pour cela, l'app envoie
              au serveur UNITECH, puis à un fournisseur d'IA :
            </p>
            <ul className="constats">
              <li>vos totaux de revenus et de dépenses, par mois et par catégorie ;</li>
              <li>votre solde disponible ;</li>
              <li>le nom, le montant et l'avancement de vos objectifs et de vos projets.</li>
            </ul>
            <p className="discret">
              Ne sont jamais envoyés : votre nom, votre email, votre téléphone et les notes de vos mouvements. Les
              conseils portent sur la gestion du budget ; ce ne sont pas des conseils de placement.
            </p>
            <button
              className="bouton principal"
              onClick={() => {
                donnerAccord()
                setAccord(true)
              }}
            >
              J'accepte et je continue
            </button>
          </>
        ) : (
          <>
            <div className="bascule trois" role="group" aria-label="Type de conseil">
              {ONGLETS.map((o) => (
                <button key={o.type} type="button" className={type === o.type ? 'choisie' : ''} onClick={() => changerOnglet(o.type)}>
                  {o.libelle}
                </button>
              ))}
            </div>

            {type === 'bilan' && <p className="discret">Un point sur le mois en cours, avec deux ou trois actions concrètes.</p>}

            {type === 'objectif' &&
              (objectifsOuverts.length === 0 ? (
                <p className="discret">Créez d'abord un objectif d'épargne dans l'onglet Plans.</p>
              ) : (
                <label>
                  Objectif
                  <select value={objectifId} onChange={(e) => setObjectifId(e.target.value)}>
                    {objectifsOuverts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nom}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

            {type === 'depense' && (
              <>
                <div className="deux">
                  <label>
                    Montant envisagé
                    <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="50000" />
                  </label>
                  <label>
                    Catégorie
                    <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
                      {donnees.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {projetsOuverts.length > 0 && (
                  <label>
                    Projet (facultatif)
                    <select value={projetId} onChange={(e) => setProjetId(e.target.value)}>
                      <option value="">Aucun</option>
                      {projetsOuverts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {analyse && (
                  <dl className="analyse">
                    <dt>Solde disponible</dt>
                    <dd>
                      {argent(analyse.soldeAvant)} → <strong className={analyse.soldeApres < 0 ? 'negatif' : ''}>{argent(analyse.soldeApres)}</strong>
                    </dd>
                    <dt>Dépenses du mois</dt>
                    <dd>
                      {argent(analyse.depensesMoisAvant)} → <strong>{argent(analyse.depensesMoisApres)}</strong>
                    </dd>
                    {analyse.partDuRevenu !== null && (
                      <>
                        <dt>Part du revenu mensuel</dt>
                        <dd>
                          <strong>{analyse.partDuRevenu} %</strong>
                        </dd>
                      </>
                    )}
                    {analyse.projet && (
                      <>
                        <dt>Budget « {analyse.projet.nom} »</dt>
                        <dd>
                          <strong className={analyse.projet.etatApres === 'depasse' ? 'negatif' : ''}>
                            {argent(analyse.projet.depenseApres)}
                          </strong>{' '}
                          sur {argent(analyse.projet.budget)}
                        </dd>
                      </>
                    )}
                    {analyse.effortEpargneMensuel > 0 && (
                      <>
                        <dt>Reste du mois pour épargner</dt>
                        <dd>
                          <strong className={analyse.resteDuMoisApres < analyse.effortEpargneMensuel ? 'negatif' : ''}>
                            {argent(analyse.resteDuMoisApres)}
                          </strong>{' '}
                          pour {argent(analyse.effortEpargneMensuel)} prévus
                        </dd>
                      </>
                    )}
                  </dl>
                )}
              </>
            )}

            <button
              className="bouton principal"
              onClick={demander}
              disabled={enCours || (type === 'objectif' && objectifsOuverts.length === 0) || (type === 'depense' && !analyse)}
            >
              {enCours ? 'Le conseiller réfléchit…' : type === 'depense' ? 'Demander l\'avis du conseiller' : 'Demander au conseiller'}
            </button>

            {enCours && <p className="discret">La première réponse peut prendre jusqu'à une minute.</p>}
            {erreur && <p className="message erreur">{erreur}</p>}
            {reponse && (
              <>
                <Reponse texte={reponse} />
                <p className="discret">
                  Réponse rédigée par une IA à partir de vos chiffres. Elle peut se tromper : vérifiez avant de décider.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
