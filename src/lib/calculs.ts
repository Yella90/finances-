import type { Compte, Transaction } from '../types'

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
