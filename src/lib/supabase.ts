import { createClient } from '@supabase/supabase-js'
import { lireSessionStockee } from './jeton'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_CLE as string | undefined

export const configurationManquante = !url || !cle

/**
 * Les comptes Finances sont gérés dans la table finances.utilisateurs, pas par
 * l'authentification Supabase. Chaque requête porte le jeton de session dans
 * l'en-tête « x-jeton-session » ; la base s'en sert pour savoir qui demande.
 */
const fetchAvecJeton: typeof fetch = (entree, options) => {
  const enTetes = new Headers(options?.headers)
  const jeton = lireSessionStockee()?.jeton
  if (jeton) enTetes.set('x-jeton-session', jeton)
  return fetch(entree, { ...options, headers: enTetes })
}

// Toutes les requêtes visent le schéma « finances », pas « public ».
export const supabase = createClient(url ?? 'http://localhost', cle ?? 'manquante', {
  db: { schema: 'finances' },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: fetchAvecJeton },
})
