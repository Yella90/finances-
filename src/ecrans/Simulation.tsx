import { useMemo, useState } from 'react'
import { soldesParCompte, totauxParMois, type SuiviObjectif } from '../lib/calculs'
import { derniersMois, formaterMontant } from '../lib/format'
import type { Donnees } from '../lib/hooks'
import {
  historiqueMensuel,
  REGULARITES,
  revenuMensuelDeclare,
  simuler,
  type ModeleMensuel,
  type Regularite,
} from '../lib/simulation'
import type { ObjectifEpargne, Utilisateur } from '../types'

const MOIS_MINIMUM = 3
const HORIZON_SANS_DATE = 60
const JOURS_PAR_MOIS = 30.44

function lireMontant(texte: string): number {
  const n = Number(texte.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function niveau(chance: number): 'bon' | 'moyen' | 'faible' {
  if (chance >= 75) return 'bon'
  if (chance >= 40) return 'moyen'
  return 'faible'
}

export default function Simulation(props: {
  profil: Utilisateur
  donnees: Donnees
  objectif: ObjectifEpargne
  suivi: SuiviObjectif
  fermer: () => void
}) {
  const { profil, donnees, objectif, suivi, fermer } = props
  const argent = (m: number) => formaterMontant(Math.round(m), profil.devise)

  const historique = useMemo(() => historiqueMensuel(donnees.transactions), [donnees.transactions])
  const assezDHistorique = historique.length >= MOIS_MINIMUM

  const soldeDepart = useMemo(
    () => [...soldesParCompte(donnees.comptes, donnees.transactions).values()].reduce((a, b) => a + b, 0),
    [donnees.comptes, donnees.transactions],
  )

  // Sans historique suffisant, on part des sources déclarées et du mois en cours.
  const moisCourant = useMemo(
    () => totauxParMois(donnees.transactions, derniersMois(1))[0],
    [donnees.transactions],
  )
  const [revenu, setRevenu] = useState(() =>
    String(revenuMensuelDeclare(donnees.sources) || Math.round(moisCourant.revenus) || ''),
  )
  const [depenses, setDepenses] = useState(() => String(Math.round(moisCourant.depenses) || ''))
  const [regularite, setRegularite] = useState<Regularite>('variables')

  const aUneDate = Boolean(objectif.date_cible) && suivi.joursRestants > 0
  const nombreMois = aUneDate ? Math.max(1, Math.ceil(suivi.joursRestants / JOURS_PAR_MOIS)) : HORIZON_SANS_DATE
  const [versement, setVersement] = useState(() =>
    String(suivi.effortMensuel ?? Math.max(1, Math.ceil(suivi.reste / 12))),
  )

  const modele: ModeleMensuel = assezDHistorique
    ? { type: 'historique', mois: historique }
    : { type: 'estimation', revenu: lireMontant(revenu), depenses: lireMontant(depenses), regularite }

  // Des dépenses laissées vides donneraient un résultat trop optimiste : on attend les deux valeurs.
  const estimationIncomplete = !assezDHistorique && (lireMontant(revenu) <= 0 || depenses.trim() === '')
  const versementMensuel = lireMontant(versement)

  const resultat = useMemo(
    () =>
      estimationIncomplete || versementMensuel <= 0
        ? null
        : simuler({ modele, soldeDepart, resteAEpargner: suivi.reste, versementMensuel, nombreMois }),
    // Le modèle est reconstruit à chaque rendu : on dépend de ses composants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assezDHistorique, historique, revenu, depenses, regularite, soldeDepart, suivi.reste, versementMensuel, nombreMois],
  )

  return (
    <div className="simulation">
      <div className="ligne">
        <strong>Simulation</strong>
        <button className="icone-bouton" onClick={fermer} aria-label="Fermer la simulation">
          ✕
        </button>
      </div>

      {resultat ? (
        <>
          <div className={`chance ${niveau(resultat.chance)}`}>
            <strong>{Math.round(resultat.chance)} %</strong>
            <span>
              {aUneDate
                ? `de chances d'atteindre « ${objectif.nom} » à la date prévue`
                : `de chances d'atteindre « ${objectif.nom} » en moins de 5 ans`}
            </span>
          </div>

          <ul className="constats">
            {resultat.moisMedian !== null && (
              <li>
                Dans un cas moyen, l'objectif est atteint en <strong>{resultat.moisMedian} mois</strong>.
              </li>
            )}
            <li>
              Au bout de {nombreMois} mois, vous auriez mis de côté entre{' '}
              <strong>{argent(resultat.epargneBasse)}</strong> (mauvais scénario) et{' '}
              <strong>{argent(resultat.epargneHaute)}</strong> (bon scénario), sur {argent(suivi.reste)} à réunir.
            </li>
            <li>
              Risque de vous retrouver sans argent disponible au moins un mois :{' '}
              <strong>{Math.round(resultat.risqueSoldeNegatif)} %</strong>.
            </li>
          </ul>
        </>
      ) : (
        <p className="message attention">
          {estimationIncomplete
            ? 'Indiquez votre revenu et vos dépenses habituels pour lancer la simulation.'
            : 'Indiquez un versement mensuel supérieur à zéro.'}
        </p>
      )}

      <div className="formulaire">
        <label>
          Versement prévu chaque mois
          <input inputMode="decimal" value={versement} onChange={(e) => setVersement(e.target.value)} />
        </label>

        {!assezDHistorique && (
          <>
            <div className="deux">
              <label>
                Revenu mensuel habituel
                <input inputMode="decimal" value={revenu} onChange={(e) => setRevenu(e.target.value)} placeholder="150000" />
              </label>
              <label>
                Dépenses mensuelles habituelles
                <input
                  inputMode="decimal"
                  value={depenses}
                  onChange={(e) => setDepenses(e.target.value)}
                  placeholder="100000"
                />
              </label>
            </div>
            <fieldset className="choix">
              <legend>Vos revenus sont</legend>
              {(Object.keys(REGULARITES) as Regularite[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={regularite === r ? 'puce choisie' : 'puce'}
                  onClick={() => setRegularite(r)}
                  aria-pressed={regularite === r}
                >
                  {REGULARITES[r].libelle}
                </button>
              ))}
            </fieldset>
          </>
        )}
      </div>

      <p className="discret">
        {assezDHistorique
          ? `Calcul fondé sur vos ${historique.length} derniers mois de revenus et de dépenses, rejoués ${resultat?.essais ?? 5000} fois dans un ordre aléatoire.`
          : `Vous avez moins de ${MOIS_MINIMUM} mois d'historique : le calcul utilise vos estimations ci-dessus. Il deviendra plus fiable à mesure que vous saisirez vos mouvements.`}{' '}
        Solde de départ : {argent(soldeDepart)}. C'est une estimation, pas une garantie.
      </p>
    </div>
  )
}
