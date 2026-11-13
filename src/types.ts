// Types alignés sur les tables du schéma « finances » de Supabase.

interface LigneBase {
  id: string
  utilisateur_id: string
  cree_le: string
  modifie_le: string
  supprime_le: string | null
}

export type TypeCompte = 'especes' | 'mobile_money' | 'banque' | 'autre'

export interface Compte extends LigneBase {
  nom: string
  type: TypeCompte
  solde_initial: number
  archive: boolean
}

export type TypeSource =
  | 'salaire'
  | 'commerce'
  | 'freelance'
  | 'agriculture'
  | 'transfert_recu'
  | 'tontine'
  | 'autre'

export type Frequence = 'ponctuel' | 'hebdomadaire' | 'mensuel' | 'annuel' | 'irregulier'

export interface SourceRevenu extends LigneBase {
  nom: string
  type: TypeSource
  montant_prevu: number | null
  frequence: Frequence
  compte_id: string | null
  actif: boolean
}

export interface Categorie extends LigneBase {
  nom: string
  icone: string | null
  couleur: string | null
}

export type TypeTransaction = 'revenu' | 'depense' | 'transfert' | 'epargne'

export interface Transaction extends LigneBase {
  type: TypeTransaction
  montant: number
  date_operation: string
  compte_id: string
  compte_destination_id: string | null
  categorie_id: string | null
  source_revenu_id: string | null
  projet_id: string | null
  ligne_budget_id: string | null
  objectif_id: string | null
  regle_recurrente_id: string | null
  note: string | null
}

export type StatutProjet = 'en_cours' | 'termine' | 'suspendu'

export interface Projet extends LigneBase {
  nom: string
  description: string | null
  budget_total: number
  date_debut: string | null
  date_fin: string | null
  statut: StatutProjet
}

/** Un poste de dépense à l'intérieur d'un projet (ciment, main-d'œuvre...). */
export interface LigneBudget extends LigneBase {
  projet_id: string
  nom: string
  montant_prevu: number
}

export interface ObjectifEpargne extends LigneBase {
  nom: string
  montant_cible: number
  date_cible: string | null
  icone: string | null
  statut: 'en_cours' | 'atteint' | 'abandonne'
}

export interface Utilisateur {
  id: string
  nom_complet: string
  email: string | null
  telephone: string | null
  devise: string
  langue: 'fr' | 'bm'
  notifications_actives: boolean
}

export interface LignesParTable {
  comptes: Compte
  categories: Categorie
  sources_revenu: SourceRevenu
  projets: Projet
  lignes_budget: LigneBudget
  objectifs_epargne: ObjectifEpargne
  transactions: Transaction
}

export type NomTable = keyof LignesParTable
