import { creer, db, ecrireMeta, lireMeta, viderBaseLocale } from './db'
import { ecrireSessionStockee, lireSessionStockee, type SessionLocale } from './jeton'
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

const MESSAGES: Record<string, string> = {
  EMAIL_INVALIDE: 'Cette adresse email n\'est pas valide.',
  MOT_DE_PASSE_TROP_COURT: 'Le mot de passe doit contenir au moins 8 caractères.',
  NOM_MANQUANT: 'Entrez votre nom.',
  CONDITIONS_NON_ACCEPTEES: 'Acceptez les conditions pour créer un compte.',
  EMAIL_DEJA_UTILISE: 'Un compte Finances existe déjà avec cet email. Connectez-vous.',
  DEVISE_OU_LANGUE_INVALIDE: 'La devise ou la langue choisie n\'est pas reconnue.',
  IDENTIFIANTS_INVALIDES: 'Email ou mot de passe incorrect.',
  COMPTE_BLOQUE: 'Trop de tentatives. Réessayez dans 15 minutes.',
}

function messageErreur(code: string): string {
  if (MESSAGES[code]) return MESSAGES[code]
  if (/Invalid schema|PGRST106/i.test(code)) {
    return 'Le service n\'est pas encore ouvert : le schéma « finances » doit être exposé dans Supabase.'
  }
  if (/fetch|network/i.test(code)) return 'Pas de connexion. Réessayez quand le réseau revient.'
  return code
}

// --- État de la session, partagé avec l'interface -------------------------

let session: SessionLocale | null = lireSessionStockee()
const abonnes = new Set<(s: SessionLocale | null) => void>()

function definirSession(nouvelle: SessionLocale | null): void {
  session = nouvelle
  ecrireSessionStockee(nouvelle)
  abonnes.forEach((f) => f(session))
}

export function lireSession(): SessionLocale | null {
  return session
}

export function ecouterSession(f: (s: SessionLocale | null) => void): () => void {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

// --- Inscription, connexion, déconnexion ----------------------------------

interface ReponseAuth {
  erreur?: string
  jeton?: string
  utilisateur?: Utilisateur
}

async function ouvrir(reponse: ReponseAuth | null, erreurReseau: string | undefined): Promise<Utilisateur> {
  if (erreurReseau) throw new Error(messageErreur(erreurReseau))
  if (!reponse || reponse.erreur || !reponse.jeton || !reponse.utilisateur) {
    throw new Error(messageErreur(reponse?.erreur ?? 'Réponse inattendue du serveur.'))
  }
  // Un autre compte était utilisé sur cet appareil : on repart d'une base vide.
  const precedent = await lireMeta<string>('utilisateur_id')
  if (precedent && precedent !== reponse.utilisateur.id) await viderBaseLocale()
  await ecrireMeta('utilisateur_id', reponse.utilisateur.id)

  definirSession({ jeton: reponse.jeton, utilisateur: reponse.utilisateur })
  return reponse.utilisateur
}

export interface DonneesInscription {
  email: string
  motDePasse: string
  nomComplet: string
  telephone: string
  devise: string
  langue: 'fr' | 'bm'
  versionConditions: string
}

export async function inscrire(d: DonneesInscription): Promise<void> {
  const { data, error } = await supabase.rpc('inscrire', {
    p_email: d.email,
    p_mot_de_passe: d.motDePasse,
    p_nom_complet: d.nomComplet,
    p_telephone: d.telephone,
    p_devise: d.devise,
    p_langue: d.langue,
    p_conditions_version: d.versionConditions,
  })
  const utilisateur = await ouvrir(data as ReponseAuth | null, error?.message)
  if ((await db.categories.count()) === 0) {
    for (const c of CATEGORIES_PAR_DEFAUT) await creer('categories', utilisateur.id, c)
  }
}

export async function connecter(email: string, motDePasse: string): Promise<void> {
  const { data, error } = await supabase.rpc('connecter', { p_email: email, p_mot_de_passe: motDePasse })
  await ouvrir(data as ReponseAuth | null, error?.message)
}

/** Ferme la session sur le serveur (si possible) et efface les données de l'appareil. */
export async function deconnecter(): Promise<void> {
  try {
    if (navigator.onLine) await supabase.rpc('deconnecter')
  } catch {
    // Hors ligne ou serveur injoignable : la session expirera d'elle-même.
  }
  definirSession(null)
  await viderBaseLocale()
}

/**
 * Vérifie auprès du serveur que la session est toujours valable et rafraîchit
 * le profil. Sans effet hors ligne. Renvoie false si la session a expiré.
 */
export async function verifierSession(): Promise<boolean> {
  if (!session || !navigator.onLine) return true
  const { data, error } = await supabase.rpc('mon_profil')
  if (error) return true // Serveur injoignable : on garde la session locale.
  if (!data) {
    definirSession(null)
    return false
  }
  definirSession({ jeton: session.jeton, utilisateur: data as Utilisateur })
  return true
}
