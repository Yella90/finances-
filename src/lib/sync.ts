import { db, ecrireMeta, lireMeta, TABLES_SYNC } from './db'
import { supabase } from './supabase'
import type { NomTable } from '../types'

export interface EtatSync {
  enCours: boolean
  erreur: string | null
  derniereReussite: string | null
}

let etat: EtatSync = { enCours: false, erreur: null, derniereReussite: null }
const abonnes = new Set<(e: EtatSync) => void>()

function publier(partiel: Partial<EtatSync>) {
  etat = { ...etat, ...partiel }
  abonnes.forEach((f) => f(etat))
}

export function lireEtatSync(): EtatSync {
  return etat
}

export function ecouterSync(f: (e: EtatSync) => void): () => void {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

const TAILLE_PAGE = 500

/** Envoie au serveur les lignes modifiées en local, table par table. */
async function envoyer(): Promise<void> {
  for (const table of TABLES_SYNC) {
    const enAttente = await db.file_attente.where('table').equals(table).toArray()
    if (enAttente.length === 0) continue

    const ids = [...new Set(enAttente.map((e) => e.id))]
    const lignes = (await db.table(table).bulkGet(ids)).filter(Boolean) as Record<string, unknown>[]

    if (lignes.length > 0) {
      // modifie_le est fixé par le serveur : on ne l'envoie pas.
      const aEnvoyer = lignes.map(({ modifie_le: _ignore, ...reste }) => reste)
      const { data, error } = await supabase.from(table).upsert(aEnvoyer).select()
      if (error) throw new Error(error.message)
      const derniereSeq = Math.max(...enAttente.map((e) => e.seq ?? 0))
      await db.transaction('rw', db.table(table), db.file_attente, async () => {
        // Ne retire de la file que ce qui vient d'être envoyé : une modification
        // faite pendant l'envoi garde son entrée et repartira au prochain tour.
        await db.file_attente.bulkDelete(enAttente.map((e) => e.seq!))
        const encoreEnAttente = new Set(
          (await db.file_attente.where('table').equals(table).toArray())
            .filter((e) => (e.seq ?? 0) > derniereSeq)
            .map((e) => e.id),
        )
        const confirmees = (data ?? []).filter((l) => !encoreEnAttente.has(l.id as string))
        await db.table(table).bulkPut(confirmees)
      })
    } else {
      await db.file_attente.bulkDelete(enAttente.map((e) => e.seq!))
    }
  }
}

/** Récupère du serveur ce qui a changé depuis la dernière synchronisation. */
async function recevoir(): Promise<void> {
  for (const table of TABLES_SYNC) {
    const cleCurseur = `curseur:${table}`
    let curseur = (await lireMeta<string>(cleCurseur)) ?? '1970-01-01T00:00:00Z'

    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .gt('modifie_le', curseur)
        .order('modifie_le', { ascending: true })
        .limit(TAILLE_PAGE)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break

      await appliquer(table, data)
      curseur = data[data.length - 1].modifie_le as string
      await ecrireMeta(cleCurseur, curseur)
      if (data.length < TAILLE_PAGE) break
    }
  }
}

async function appliquer(table: NomTable, lignes: Record<string, unknown>[]): Promise<void> {
  await db.transaction('rw', db.table(table), db.file_attente, async () => {
    // Une ligne modifiée en local et pas encore envoyée garde la version locale.
    const enAttente = new Set(
      (await db.file_attente.where('table').equals(table).toArray()).map((e) => e.id),
    )
    await db.table(table).bulkPut(lignes.filter((l) => !enAttente.has(l.id as string)))
  })
}

let enCours: Promise<void> | null = null

/** Lance une synchronisation complète : envoi puis réception. Sans effet hors ligne. */
export function synchroniser(): Promise<void> {
  if (enCours) return enCours
  if (!navigator.onLine) return Promise.resolve()

  publier({ enCours: true })
  enCours = (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      await envoyer()
      await recevoir()
      publier({ erreur: null, derniereReussite: new Date().toISOString() })
    } catch (e) {
      publier({ erreur: e instanceof Error ? e.message : String(e) })
    } finally {
      enCours = null
      publier({ enCours: false })
    }
  })()
  return enCours
}

/** Synchronise au retour du réseau, au retour sur l'app et toutes les deux minutes. */
export function demarrerSyncAuto(): () => void {
  const lancer = () => void synchroniser()
  const surVisible = () => {
    if (document.visibilityState === 'visible') lancer()
  }
  window.addEventListener('online', lancer)
  document.addEventListener('visibilitychange', surVisible)
  const minuteur = window.setInterval(lancer, 120_000)
  lancer()
  return () => {
    window.removeEventListener('online', lancer)
    document.removeEventListener('visibilitychange', surVisible)
    window.clearInterval(minuteur)
  }
}
