import type { Utilisateur } from '../types'

// La session vit dans le stockage du navigateur : elle doit rester lisible hors ligne.
const CLE = 'finances.session'

export interface SessionLocale {
  jeton: string
  utilisateur: Utilisateur
}

export function lireSessionStockee(): SessionLocale | null {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return null
    const s = JSON.parse(brut) as SessionLocale
    return s?.jeton && s?.utilisateur?.id ? s : null
  } catch {
    return null
  }
}

export function ecrireSessionStockee(session: SessionLocale | null): void {
  try {
    if (session) localStorage.setItem(CLE, JSON.stringify(session))
    else localStorage.removeItem(CLE)
  } catch {
    // Stockage indisponible (navigation privée) : la session ne survivra pas au rechargement.
  }
}
