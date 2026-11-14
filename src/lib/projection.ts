// Projection de fin de mois.
//
// Le mois en cours n'est jamais « terminé » tant que la dernière journée n'est
// pas passée : comparer les revenus et les dépenses à ce jour donne une image
// fausse. Ici, on estime ce qu'il reste à recevoir et à dépenser d'ici la fin
// du mois, pour raisonner sur le mois entier.

import type { Donnees } from './hooks'
import { soldesParCompte } from './calculs'
import { historiqueMensuel, revenuMensuelDeclare } from './simulation'

export type BaseRevenus = 'sources_declarees' | 'moyenne_des_mois_passes' | 'inconnue'

export interface ProjectionMois {
  joursDansLeMois: number
  /** Jours déjà entamés, aujourd'hui compris. */
  joursEcoules: number
  /** Jours qui restent après aujourd'hui. */
  joursRestants: number

  revenusRecus: number
  /** Ce qu'on s'attend encore à recevoir d'ici la fin du mois. */
  revenusEncoreAttendus: number
  revenusAttendusSurLeMois: number
  baseRevenus: BaseRevenus

  depensesFaites: number
  /** Ce qu'on dépensera encore au rythme des jours écoulés. */
  depensesEncorePrevues: number
  depensesProjeteesSurLeMois: number
  /** Dépense isolée mise de côté pour ne pas fausser le rythme quotidien, ou 0. */
  depenseExceptionnelle: number

  soldeActuel: number
  soldeProjeteFinDeMois: number
  /** Revenus attendus sur le mois moins dépenses projetées sur le mois. */
  resteProjete: number

  /** Faible en tout début de mois ou sans revenu attendu connu. */
  fiabilite: 'faible' | 'correcte'
}

/** Une dépense qui pèse plus que cette part du total du mois est traitée comme exceptionnelle. */
const SEUIL_EXCEPTIONNEL = 0.4
const JOURS_MINIMUM_FIABLES = 5

export function projectionFinDeMois(donnees: Donnees, maintenant = new Date()): ProjectionMois {
  const annee = maintenant.getFullYear()
  const mois = maintenant.getMonth()
  const cleMois = `${annee}-${String(mois + 1).padStart(2, '0')}`
  const joursDansLeMois = new Date(annee, mois + 1, 0).getDate()
  const joursEcoules = maintenant.getDate()
  const joursRestants = joursDansLeMois - joursEcoules

  let revenusRecus = 0
  let depensesFaites = 0
  let plusGrosseDepense = 0
  let nombreDepenses = 0
  for (const t of donnees.transactions) {
    if (!t.date_operation.startsWith(cleMois)) continue
    const m = Number(t.montant)
    if (t.type === 'revenu') revenusRecus += m
    else if (t.type === 'depense') {
      depensesFaites += m
      nombreDepenses++
      if (m > plusGrosseDepense) plusGrosseDepense = m
    }
  }

  // Revenus : d'abord ce que l'utilisateur a déclaré, sinon la moyenne des mois passés.
  const declare = revenuMensuelDeclare(donnees.sources)
  const historique = historiqueMensuel(donnees.transactions, maintenant)
  const moyenne =
    historique.length >= 2 ? historique.reduce((s, h) => s + h.revenus, 0) / historique.length : 0

  let baseRevenus: BaseRevenus = 'inconnue'
  let attendu = 0
  if (declare > 0) {
    attendu = declare
    baseRevenus = 'sources_declarees'
  } else if (moyenne > 0) {
    attendu = moyenne
    baseRevenus = 'moyenne_des_mois_passes'
  }
  // Si on a déjà reçu plus que prévu, on n'attend plus rien : on ne retire pas ce qui est là.
  const revenusAttendusSurLeMois = Math.max(attendu, revenusRecus)
  const revenusEncoreAttendus = revenusAttendusSurLeMois - revenusRecus

  // Dépenses : rythme quotidien des jours écoulés, hors dépense isolée
  // (un loyer payé le 2 ne se répète pas tous les deux jours).
  const depenseExceptionnelle =
    nombreDepenses > 1 && plusGrosseDepense > depensesFaites * SEUIL_EXCEPTIONNEL ? plusGrosseDepense : 0
  const rythmeQuotidien = joursEcoules > 0 ? (depensesFaites - depenseExceptionnelle) / joursEcoules : 0
  const depensesEncorePrevues = rythmeQuotidien * joursRestants
  const depensesProjeteesSurLeMois = depensesFaites + depensesEncorePrevues

  const soldeActuel = [...soldesParCompte(donnees.comptes, donnees.transactions).values()].reduce(
    (a, b) => a + b,
    0,
  )

  const r = Math.round
  return {
    joursDansLeMois,
    joursEcoules,
    joursRestants,
    revenusRecus: r(revenusRecus),
    revenusEncoreAttendus: r(revenusEncoreAttendus),
    revenusAttendusSurLeMois: r(revenusAttendusSurLeMois),
    baseRevenus,
    depensesFaites: r(depensesFaites),
    depensesEncorePrevues: r(depensesEncorePrevues),
    depensesProjeteesSurLeMois: r(depensesProjeteesSurLeMois),
    depenseExceptionnelle: r(depenseExceptionnelle),
    soldeActuel: r(soldeActuel),
    soldeProjeteFinDeMois: r(soldeActuel + revenusEncoreAttendus - depensesEncorePrevues),
    resteProjete: r(revenusAttendusSurLeMois - depensesProjeteesSurLeMois),
    fiabilite: joursEcoules < JOURS_MINIMUM_FIABLES || baseRevenus === 'inconnue' ? 'faible' : 'correcte',
  }
}
