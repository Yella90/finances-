import Dexie, { type Table } from 'dexie'
import type { Categorie, Compte, LignesParTable, NomTable, SourceRevenu, Transaction } from '../types'

// Ordre d'envoi au serveur : les tables référencées passent avant celles qui les référencent.
export const TABLES_SYNC: NomTable[] = ['comptes', 'categories', 'sources_revenu', 'transactions']

export interface ElementFile {
  seq?: number
  table: NomTable
  id: string
}

export interface Meta {
  cle: string
  valeur: unknown
}

class BaseLocale extends Dexie {
  comptes!: Table<Compte, string>
  categories!: Table<Categorie, string>
  sources_revenu!: Table<SourceRevenu, string>
  transactions!: Table<Transaction, string>
  file_attente!: Table<ElementFile, number>
  meta!: Table<Meta, string>

  constructor() {
    super('finances')
    this.version(1).stores({
      comptes: 'id',
      categories: 'id',
      sources_revenu: 'id',
      transactions: 'id, date_operation, compte_id',
      file_attente: '++seq, table, id',
      meta: 'cle',
    })
  }
}

export const db = new BaseLocale()

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  return (await db.meta.get(cle))?.valeur as T | undefined
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  await db.meta.put({ cle, valeur })
}

function tableLocale<N extends NomTable>(nom: N): Table<LignesParTable[N], string> {
  return db.table(nom)
}

type ChampsAuto = 'id' | 'utilisateur_id' | 'cree_le' | 'modifie_le' | 'supprime_le'

/** Crée une ligne en local et la place dans la file d'envoi vers le serveur. */
export async function creer<N extends NomTable>(
  table: N,
  utilisateurId: string,
  champs: Omit<LignesParTable[N], ChampsAuto>,
): Promise<LignesParTable[N]> {
  const maintenant = new Date().toISOString()
  const ligne = {
    ...champs,
    id: crypto.randomUUID(),
    utilisateur_id: utilisateurId,
    cree_le: maintenant,
    modifie_le: maintenant,
    supprime_le: null,
  } as unknown as LignesParTable[N]
  await db.transaction('rw', tableLocale(table), db.file_attente, async () => {
    await tableLocale(table).put(ligne)
    await db.file_attente.add({ table, id: ligne.id })
  })
  return ligne
}

/** Modifie une ligne en local et la place dans la file d'envoi. */
export async function modifier<N extends NomTable>(
  table: N,
  id: string,
  changements: Partial<Omit<LignesParTable[N], 'id' | 'utilisateur_id' | 'cree_le'>>,
): Promise<void> {
  await db.transaction('rw', tableLocale(table), db.file_attente, async () => {
    const actuelle = await tableLocale(table).get(id)
    if (!actuelle) return
    await tableLocale(table).put({
      ...actuelle,
      ...changements,
      modifie_le: new Date().toISOString(),
    })
    await db.file_attente.add({ table, id })
  })
}

/** Suppression douce : la ligne reste, marquée, pour que la synchro propage la suppression. */
export function supprimer(table: NomTable, id: string): Promise<void> {
  return modifier(table, id, { supprime_le: new Date().toISOString() })
}

/** Vide toutes les données locales (changement de compte sur l'appareil). */
export async function viderBaseLocale(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}
