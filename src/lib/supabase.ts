import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_CLE as string | undefined

export const configurationManquante = !url || !cle

// Toutes les requêtes visent le schéma « finances », pas « public ».
export const supabase = createClient(url ?? 'http://localhost', cle ?? 'manquante', {
  db: { schema: 'finances' },
  auth: { persistSession: true, autoRefreshToken: true },
})
