import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { ecouterSync, lireEtatSync, type EtatSync } from './sync'
import type { Categorie, Compte, SourceRevenu, Transaction } from '../types'

export interface Donnees {
  comptes: Compte[]
  categories: Categorie[]
  sources: SourceRevenu[]
  transactions: Transaction[]
  pret: boolean
}

const actif = <T extends { supprime_le: string | null }>(l: T) => !l.supprime_le

/** Toutes les données locales, mises à jour en direct à chaque écriture. */
export function useDonnees(): Donnees {
  const resultat = useLiveQuery(async () => {
    const [comptes, categories, sources, transactions] = await Promise.all([
      db.comptes.toArray(),
      db.categories.toArray(),
      db.sources_revenu.toArray(),
      db.transactions.orderBy('date_operation').reverse().toArray(),
    ])
    return {
      comptes: comptes.filter(actif).sort((a, b) => a.cree_le.localeCompare(b.cree_le)),
      categories: categories.filter(actif).sort((a, b) => a.cree_le.localeCompare(b.cree_le)),
      sources: sources.filter(actif).sort((a, b) => a.cree_le.localeCompare(b.cree_le)),
      transactions: transactions.filter(actif),
    }
  }, [])
  return resultat
    ? { ...resultat, pret: true }
    : { comptes: [], categories: [], sources: [], transactions: [], pret: false }
}

export function useEtatSync(): EtatSync & { enAttente: number } {
  const [etat, setEtat] = useState(lireEtatSync())
  useEffect(() => ecouterSync(setEtat), [])
  const enAttente = useLiveQuery(() => db.file_attente.count(), [], 0)
  return { ...etat, enAttente }
}

export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine)
  useEffect(() => {
    const oui = () => setEnLigne(true)
    const non = () => setEnLigne(false)
    window.addEventListener('online', oui)
    window.addEventListener('offline', non)
    return () => {
      window.removeEventListener('online', oui)
      window.removeEventListener('offline', non)
    }
  }, [])
  return enLigne
}
