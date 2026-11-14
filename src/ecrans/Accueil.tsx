import { useMemo } from 'react'
import { depensesParCategorie, soldesParCompte, totauxParMois } from '../lib/calculs'
import { derniersMois, formaterMontant, nomMois } from '../lib/format'
import { useEnLigne, useEtatSync, type Donnees } from '../lib/hooks'
import type { Utilisateur } from '../types'
import { useConseilAuto } from '../lib/conseilAuto'
import { projectionFinDeMois } from '../lib/projection'
import { Reponse } from './Conseiller'
import LigneTransaction from './LigneTransaction'

export default function Accueil(props: {
  profil: Utilisateur
  donnees: Donnees
  allerAuxReglages: () => void
  ouvrirConseiller: () => void
}) {
  const { profil, donnees, allerAuxReglages, ouvrirConseiller } = props
  const { comptes, categories, transactions } = donnees
  const argent = (m: number) => formaterMontant(m, profil.devise)

  const mois = useMemo(() => derniersMois(6), [])
  const moisCourant = mois[mois.length - 1]

  const soldes = useMemo(() => soldesParCompte(comptes, transactions), [comptes, transactions])
  const soldeTotal = [...soldes.values()].reduce((a, b) => a + b, 0)
  const totaux = useMemo(() => totauxParMois(transactions, mois), [transactions, mois])
  const ceMois = totaux[totaux.length - 1]
  const plusHaut = Math.max(1, ...totaux.flatMap((t) => [t.revenus, t.depenses]))
  const parCategorie = useMemo(() => depensesParCategorie(transactions, moisCourant), [transactions, moisCourant])

  const prenom = profil.nom_complet.split(' ')[0]
  const conseil = useConseilAuto(profil, donnees)
  const prevision = useMemo(() => projectionFinDeMois(donnees), [donnees])

  return (
    <>
      <header className="entete">
        <div>
          <p className="discret">Bonjour {prenom}</p>
          <h1>{nomMois(moisCourant)}</h1>
        </div>
        <BadgeSync />
      </header>

      {donnees.pret && comptes.length === 0 ? (
        <section className="carte vide">
          <h2>Ajoutez votre premier compte</h2>
          <p>Un compte, c'est l'endroit où se trouve votre argent : espèces, Orange Money, banque.</p>
          <button className="bouton principal" onClick={allerAuxReglages}>
            Ajouter un compte
          </button>
        </section>
      ) : (
        <>
          <section className="solde">
            <p>Solde total</p>
            <strong>{argent(soldeTotal)}</strong>
            <div className="comptes">
              {comptes.map((c) => (
                <span key={c.id}>
                  {c.nom} · {argent(soldes.get(c.id) ?? 0)}
                </span>
              ))}
            </div>
          </section>

          <section className="duo">
            <div className="tuile">
              <p>Revenus du mois</p>
              <strong className="positif">+{argent(ceMois.revenus)}</strong>
            </div>
            <div className="tuile">
              <p>Dépenses du mois</p>
              <strong className="negatif">−{argent(ceMois.depenses)}</strong>
            </div>
          </section>

          <section className="carte">
            <div className="ligne">
              <h2>Prévision de fin de mois</h2>
              <span className="discret">
                {prevision.joursRestants === 0 ? 'Dernier jour' : `${prevision.joursRestants} jour(s) restant(s)`}
              </span>
            </div>
            <dl className="analyse">
              <dt>Revenus encore attendus</dt>
              <dd>
                {prevision.baseRevenus === 'inconnue' ? (
                  <span className="discret">inconnus</span>
                ) : (
                  <strong className="positif">+{argent(prevision.revenusEncoreAttendus)}</strong>
                )}
              </dd>
              <dt>Dépenses encore prévues</dt>
              <dd>
                <strong className="negatif">−{argent(prevision.depensesEncorePrevues)}</strong>
              </dd>
              <dt>Solde prévu à la fin du mois</dt>
              <dd>
                <strong className={prevision.soldeProjeteFinDeMois < 0 ? 'negatif' : ''}>
                  {argent(prevision.soldeProjeteFinDeMois)}
                </strong>
              </dd>
            </dl>
            <p className="discret">
              {prevision.baseRevenus === 'sources_declarees'
                ? 'Revenus d\'après vos sources déclarées, dépenses au rythme des jours écoulés.'
                : prevision.baseRevenus === 'moyenne_des_mois_passes'
                  ? 'Revenus d\'après la moyenne de vos mois passés, dépenses au rythme des jours écoulés.'
                  : 'Renseignez le montant prévu de vos sources de revenu dans les réglages pour estimer les revenus à venir.'}
              {prevision.fiabilite === 'faible' && prevision.baseRevenus !== 'inconnue'
                ? ' Le mois commence à peine : cette prévision est encore incertaine.'
                : ''}
            </p>
          </section>

          {!conseil.actif ? (
            <section className="carte conseiller-entree">
              <div>
                <h2>Conseiller</h2>
                <p className="discret">
                  Activez-le pour recevoir chaque jour un bilan et des conseils, sans avoir à les demander.
                </p>
              </div>
              <button className="bouton principal" onClick={ouvrirConseiller}>
                Activer
              </button>
            </section>
          ) : (
            <section className="carte">
              <div className="ligne">
                <h2>Conseil du jour</h2>
                {conseil.recuLe && (
                  <span className="discret">
                    {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
                      new Date(conseil.recuLe),
                    )}
                  </span>
                )}
              </div>

              {conseil.contenu ? (
                <Reponse texte={conseil.contenu} />
              ) : (
                <p className="discret">
                  {conseil.chargement
                    ? 'Le conseiller prépare votre premier bilan. Cela peut prendre jusqu\'à une minute.'
                    : transactions.length === 0
                      ? 'Votre premier conseil arrivera dès que vous aurez saisi un revenu ou une dépense.'
                      : 'Votre conseil s\'affichera ici à la prochaine connexion.'}
                </p>
              )}

              {conseil.erreur && <p className="message erreur">{conseil.erreur}</p>}
              {conseil.contenu && (
                <p className="discret">Rédigé par une IA à partir de vos chiffres. Elle peut se tromper.</p>
              )}

              <div className="deux">
                <button className="bouton" onClick={conseil.actualiser} disabled={conseil.chargement || transactions.length === 0}>
                  {conseil.chargement ? 'Mise à jour…' : 'Actualiser'}
                </button>
                <button className="bouton" onClick={ouvrirConseiller}>
                  Poser une question
                </button>
              </div>
            </section>
          )}

          <section className="carte">
            <h2>Revenus et dépenses sur 6 mois</h2>
            <div className="barres" role="img" aria-label="Revenus et dépenses des six derniers mois">
              {totaux.map((t) => (
                <div key={t.mois} className="groupe" title={`${nomMois(t.mois)} : +${argent(t.revenus)}, −${argent(t.depenses)}`}>
                  <div className="paire">
                    <span className="baton revenu" style={{ height: `${(t.revenus / plusHaut) * 100}%` }} />
                    <span className="baton depense" style={{ height: `${(t.depenses / plusHaut) * 100}%` }} />
                  </div>
                  <small>{nomMois(t.mois, true)}</small>
                </div>
              ))}
            </div>
            <p className="legende">
              <span className="pastille revenu" /> Revenus <span className="pastille depense" /> Dépenses
            </p>
          </section>

          <section className="carte">
            <h2>Dépenses par catégorie</h2>
            {parCategorie.length === 0 ? (
              <p className="discret">Aucune dépense ce mois-ci.</p>
            ) : (
              <ul className="repartition">
                {parCategorie.map((l) => {
                  const cat = categories.find((c) => c.id === l.categorieId)
                  const part = ceMois.depenses > 0 ? (l.total / ceMois.depenses) * 100 : 0
                  return (
                    <li key={l.categorieId ?? 'sans'}>
                      <div className="ligne">
                        <span>
                          {cat?.icone} {cat?.nom ?? 'Sans catégorie'}
                        </span>
                        <span>
                          {argent(l.total)} · {Math.round(part)} %
                        </span>
                      </div>
                      <div className="jauge">
                        <span style={{ width: `${part}%`, background: cat?.couleur ?? '#888780' }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="carte">
            <h2>Derniers mouvements</h2>
            {transactions.length === 0 ? (
              <p className="discret">Appuyez sur + pour saisir votre première dépense ou votre premier revenu.</p>
            ) : (
              <ul className="liste">
                {transactions.slice(0, 5).map((t) => (
                  <LigneTransaction key={t.id} transaction={t} donnees={donnees} devise={profil.devise} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}

function BadgeSync() {
  const enLigne = useEnLigne()
  const sync = useEtatSync()

  if (!enLigne) {
    return (
      <span className="badge attention">
        Hors ligne{sync.enAttente > 0 ? ` · ${sync.enAttente} en attente` : ''}
      </span>
    )
  }
  if (sync.enCours) return <span className="badge">Synchronisation…</span>
  if (sync.erreur) return <span className="badge attention" title={sync.erreur}>Synchro en échec</span>
  if (sync.enAttente > 0) return <span className="badge attention">{sync.enAttente} en attente</span>
  return <span className="badge ok">À jour</span>
}
