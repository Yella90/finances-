// Simulation de Monte-Carlo : on rejoue des milliers de fois les mois à venir
// avec des revenus et des dépenses tirés au hasard, pour obtenir une
// probabilité plutôt qu'une seule prévision.

import type { SourceRevenu, Transaction } from '../types'

export interface MoisHistorique {
  mois: string
  revenus: number
  depenses: number
}

/** Les 12 derniers mois terminés qui contiennent au moins un revenu ou une dépense. */
export function historiqueMensuel(transactions: Transaction[], maintenant = new Date()): MoisHistorique[] {
  const parMois = new Map<string, MoisHistorique>()
  for (let i = 12; i >= 1; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    parMois.set(cle, { mois: cle, revenus: 0, depenses: 0 })
  }
  for (const t of transactions) {
    const ligne = parMois.get(t.date_operation.slice(0, 7))
    if (!ligne) continue
    if (t.type === 'revenu') ligne.revenus += Number(t.montant)
    else if (t.type === 'depense') ligne.depenses += Number(t.montant)
  }
  return [...parMois.values()].filter((m) => m.revenus > 0 || m.depenses > 0)
}

/** Revenu mensuel attendu d'après les sources de revenu déclarées. */
export function revenuMensuelDeclare(sources: SourceRevenu[]): number {
  let total = 0
  for (const s of sources) {
    if (!s.actif || s.montant_prevu == null) continue
    const m = Number(s.montant_prevu)
    if (s.frequence === 'mensuel') total += m
    else if (s.frequence === 'hebdomadaire') total += m * 4.33
    else if (s.frequence === 'annuel') total += m / 12
  }
  return Math.round(total)
}

/** Écart type relatif des revenus selon leur régularité. */
export const REGULARITES = {
  reguliers: { libelle: 'Réguliers', variation: 0.1 },
  variables: { libelle: 'Variables', variation: 0.25 },
  tres_variables: { libelle: 'Très variables', variation: 0.5 },
} as const

export type Regularite = keyof typeof REGULARITES

export type ModeleMensuel =
  /** Assez d'historique : on retire au hasard des mois réellement vécus. */
  | { type: 'historique'; mois: MoisHistorique[] }
  /** Pas assez d'historique : estimation donnée par l'utilisateur. */
  | { type: 'estimation'; revenu: number; depenses: number; regularite: Regularite }

export interface ParametresSimulation {
  modele: ModeleMensuel
  /** Argent disponible aujourd'hui, tous comptes confondus. */
  soldeDepart: number
  /** Ce qu'il reste à mettre de côté pour atteindre l'objectif. */
  resteAEpargner: number
  /** Versement prévu chaque mois. */
  versementMensuel: number
  /** Nombre de mois avant la date visée, ou horizon maximal sans date. */
  nombreMois: number
  essais?: number
}

export interface ResultatSimulation {
  /** Part des essais où l'objectif est atteint dans le délai (0 à 100). */
  chance: number
  /** Part des essais où le solde passe sous zéro au moins une fois (0 à 100). */
  risqueSoldeNegatif: number
  /** Épargne cumulée à la fin du délai : cas défavorable, médian, favorable. */
  epargneBasse: number
  epargneMediane: number
  epargneHaute: number
  /** Mois nécessaires dans le cas médian, ou null si l'objectif est rarement atteint. */
  moisMedian: number | null
  essais: number
}

/** Générateur pseudo-aléatoire à graine fixe : mêmes entrées, mêmes résultats. */
function generateur(graine: number): () => number {
  let etat = graine >>> 0
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normale(hasard: () => number, moyenne: number, ecartType: number): number {
  const u = Math.max(hasard(), 1e-12)
  const v = hasard()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(0, moyenne + ecartType * z)
}

function centile(triees: number[], p: number): number {
  if (triees.length === 0) return 0
  const i = Math.min(triees.length - 1, Math.max(0, Math.round((triees.length - 1) * p)))
  return triees[i]
}

export function simuler(p: ParametresSimulation): ResultatSimulation {
  const essais = p.essais ?? 5000
  const hasard = generateur(20261113)
  const mois = Math.max(1, Math.round(p.nombreMois))

  const tirerMois = (): { revenus: number; depenses: number } => {
    if (p.modele.type === 'historique') {
      return p.modele.mois[Math.floor(hasard() * p.modele.mois.length)]
    }
    const variation = REGULARITES[p.modele.regularite].variation
    return {
      revenus: normale(hasard, p.modele.revenu, p.modele.revenu * variation),
      // Les dépenses bougent moins que les revenus, mais jamais parfaitement stables.
      depenses: normale(hasard, p.modele.depenses, p.modele.depenses * Math.max(0.1, variation / 2)),
    }
  }

  let reussites = 0
  let soldesNegatifs = 0
  const epargnes: number[] = []
  const moisAtteinte: number[] = []

  for (let e = 0; e < essais; e++) {
    let solde = p.soldeDepart
    let epargne = 0
    let negatif = false
    let atteintAuMois: number | null = null

    for (let m = 1; m <= mois; m++) {
      const tirage = tirerMois()
      solde += tirage.revenus - tirage.depenses
      if (solde < 0) negatif = true

      // On verse ce qui est prévu si l'argent est là, sinon ce qu'il reste.
      const versement = Math.max(0, Math.min(p.versementMensuel, solde, p.resteAEpargner - epargne))
      solde -= versement
      epargne += versement

      if (atteintAuMois === null && epargne >= p.resteAEpargner) atteintAuMois = m
    }

    if (atteintAuMois !== null) {
      reussites++
      moisAtteinte.push(atteintAuMois)
    }
    if (negatif) soldesNegatifs++
    epargnes.push(epargne)
  }

  epargnes.sort((a, b) => a - b)
  moisAtteinte.sort((a, b) => a - b)

  return {
    chance: (reussites / essais) * 100,
    risqueSoldeNegatif: (soldesNegatifs / essais) * 100,
    epargneBasse: centile(epargnes, 0.1),
    epargneMediane: centile(epargnes, 0.5),
    epargneHaute: centile(epargnes, 0.9),
    moisMedian: reussites >= essais / 2 ? centile(moisAtteinte, Math.min(1, essais / 2 / reussites)) : null,
    essais,
  }
}
