import type { User } from '@supabase/supabase-js'
import { creer, db, ecrireMeta, lireMeta, viderBaseLocale } from './db'
import { supabase } from './supabase'
import type { Utilisateur } from '../types'

const CATEGORIES_PAR_DEFAUT: { nom: string; icone: string; couleur: string }[] = [
  { nom: 'Nourriture', icone: '🍚', couleur: '#7f77dd' },
  { nom: 'Transport', icone: '🚌', couleur: '#d4537e' },
  { nom: 'Loyer', icone: '🏠', couleur: '#ef9f27' },
  { nom: 'Eau et électricité', icone: '💡', couleur: '#378add' },
  { nom: 'Téléphone et internet', icone: '📱', couleur: '#1d9e75' },
  { nom: 'Santé', icone: '💊', couleur: '#e24b4a' },
  { nom: 'École', icone: '📚', couleur: '#639922' },
  { nom: 'Famille', icone: '👪', couleur: '#d85a30' },
  { nom: 'Fêtes et cérémonies', icone: '🎉', couleur: '#993556' },
  { nom: 'Autre', icone: '📦', couleur: '#888780' },
]

function profilDepuisMetadonnees(user: User): Utilisateur {
  const m = user.user_metadata ?? {}
  return {
    id: user.id,
    nom_complet: (m.nom_complet as string) || user.email || 'Utilisateur',
    email: user.email ?? null,
    telephone: (m.telephone as string) || null,
    devise: (m.devise as string) || 'XOF',
    langue: m.langue === 'bm' ? 'bm' : 'fr',
    notifications_actives: true,
  }
}

/**
 * Charge le profil de l'utilisateur connecté.
 * En ligne : lit la table « utilisateurs » et crée la ligne à la première connexion.
 * Hors ligne : utilise la copie gardée sur l'appareil.
 */
export async function chargerProfil(user: User): Promise<Utilisateur> {
  const local = await lireMeta<Utilisateur>('profil')

  // Un autre compte s'est connecté sur cet appareil : on repart d'une base vide.
  if (local && local.id !== user.id) await viderBaseLocale()
  const cache = local && local.id === user.id ? local : undefined

  if (!navigator.onLine) return cache ?? profilDepuisMetadonnees(user)

  try {
    const { data, error } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)

    if (data) {
      await ecrireMeta('profil', data)
      return data as Utilisateur
    }

    const nouveau = profilDepuisMetadonnees(user)
    const { data: cree, error: erreurCreation } = await supabase
      .from('utilisateurs')
      .insert(nouveau)
      .select()
      .single()
    if (erreurCreation) throw new Error(erreurCreation.message)

    await ecrireMeta('profil', cree)
    if ((await db.categories.count()) === 0) {
      for (const c of CATEGORIES_PAR_DEFAUT) await creer('categories', user.id, c)
    }
    return cree as Utilisateur
  } catch (e) {
    if (cache) return cache
    throw e
  }
}
