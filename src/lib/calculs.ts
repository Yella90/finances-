import type { Compte, ObjectifEpargne, Transaction } from '../types'

/** Solde de chaque compte : solde initial + entrées − sorties. */
export function soldesParCompte(comptes: Compte[], transactions: Transaction[]): Map<string, number> {
  const soldes = new Map<string, number>()
  for (const c of comptes) soldes.set(c.id, Number(c.solde_initial))

  const ajouter = (id: string | null, delta: number) => {
    if (id && soldes.has(id)) soldes.set(id, soldes.get(id)! + delta)
  }

  for (const t of transactions) {
    const m = Number(t.montant)
    if (t.type === 'revenu') ajouter(t.compte_id, m)
    else if (t.type === 'depense' || t.type === 'epargne') ajouter(t.compte_id, -m)
    else if (t.type === 'transfert') {
      ajouter(t.compte_id, -m)
      ajouter(t.compte_destination_id, m)
    }
  }
  return soldes
}

export interface TotauxMois {
  mois: string
  revenus: number
  depenses: number
}

/** Revenus et dépenses pour chaque mois demandé (clés AAAA-MM). */
export function totauxParMois(transactions: Transaction[], mois: string[]): TotauxMois[] {
  const parMois = new Map<string, TotauxMois>(mois.map((m) => [m, { mois: m, revenus: 0, depenses: 0 }]))
  for (const t of transactions) {
    const ligne = parMois.get(t.date_operation.slice(0, 7))
    if (!ligne) continue
    if (t.type === 'revenu') ligne.revenus += Number(t.montant)
    else if (t.type === 'depense') ligne.depenses += Number(t.montant)
  }
  return mois.map((m) => parMois.get(m)!)
}

/** Dépenses du mois regroupées par catégorie, de la plus grosse à la plus petite. */
export function depensesParCategorie(
  transactions: Transaction[],
  mois: string,
): { categorieId: string | null; total: number }[] {
  const totaux = new Map<string | null, number>()
  for (const t of transactions) {
    if (t.type !== 'depense' || !t.date_operation.startsWith(mois)) continue
    totaux.set(t.categorie_id, (totaux.get(t.categorie_id) ?? 0) + Number(t.montant))
  }
  return [...totaux.entries()]
    .map(([categorieId, total]) => ({ categorieId, total }))
    .sort((a, b) => b.total - a.total)
}

export type NiveauBudget = 'normal' | 'attention' | 'depasse'

/** Alerte à partir de 80 % du budget consommé, dépassement à partir de 100 %. */
export function niveauBudget(depense: number, prevu: number): NiveauBudget {
  if (prevu <= 0) return depense > 0 ? 'depasse' : 'normal'
  const part = depense / prevu
  if (part >= 1) return 'depasse'
  if (part >= 0.8) return 'attention'
  return 'normal'
}

export interface DepensesProjets {
  parProjet: Map<string, number>
  parLigne: Map<string, number>
}

/** Total des dépenses rattachées à chaque projet et à chaque poste. */
export function depensesDesProjets(transactions: Transaction[]): DepensesProjets {
  const parProjet = new Map<string, number>()
  const parLigne = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'depense' || !t.projet_id) continue
    const m = Number(t.montant)
    parProjet.set(t.projet_id, (parProjet.get(t.projet_id) ?? 0) + m)
    if (t.ligne_budget_id) parLigne.set(t.ligne_budget_id, (parLigne.get(t.ligne_budget_id) ?? 0) + m)
  }
  return { parProjet, parLigne }
}

/** Total versé sur chaque objectif d'épargne. */
export function epargneParObjectif(transactions: Transaction[]): Map<string, number> {
  const totaux = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'epargne' || !t.objectif_id) continue
    totaux.set(t.objectif_id, (totaux.get(t.objectif_id) ?? 0) + Number(t.montant))
  }
  return totaux
}

export interface SuiviObjectif {
  epargne: number
  reste: number
  /** Avancement en pourcentage, plafonné à 100. */
  part: number
  atteint: boolean
  /** Jours avant la date visée ; 0 si elle est passée ou absente. */
  joursRestants: number
  /** Montant à mettre de côté chaque mois pour arriver à temps ; null sans date. */
  effortMensuel: number | null
  /** Écart avec un rythme régulier depuis la création de l'objectif. */
  retard: number
}

const JOUR = 24 * 60 * 60 * 1000
const JOURS_PAR_MOIS = 30.44

export function suiviObjectif(objectif: ObjectifEpargne, epargne: number, maintenant = new Date()): SuiviObjectif {
  const cible = Number(objectif.montant_cible)
  const reste = Math.max(0, cible - epargne)
  const atteint = epargne >= cible
  const part = cible > 0 ? Math.min(100, (epargne / cible) * 100) : 0

  if (!objectif.date_cible) {
    return { epargne, reste, part, atteint, joursRestants: 0, effortMensuel: null, retard: 0 }
  }

  const [a, m, j] = objectif.date_cible.split('-').map(Number)
  const fin = new Date(a, m - 1, j).getTime()
  const debut = new Date(objectif.cree_le).getTime()
  const joursRestants = Math.max(0, Math.ceil((fin - maintenant.getTime()) / JOUR))

  // Au moins un mois : sinon un objectif à 10 jours afficherait un effort « par mois » trompeur.
  const moisRestants = Math.max(1, joursRestants / JOURS_PAR_MOIS)
  const effortMensuel = joursRestants > 0 ? Math.ceil(reste / moisRestants) : reste

  const duree = fin - debut
  const ecoule = Math.min(Math.max(maintenant.getTime() - debut, 0), Math.max(duree, 0))
  const attendu = duree > 0 ? cible * (ecoule / duree) : 0
  const retard = atteint ? 0 : Math.max(0, Math.round(attendu - epargne))

  return { epargne, reste, part, atteint, joursRestants, effortMensuel, retard }
}
