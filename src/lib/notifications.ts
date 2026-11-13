import { niveauBudget, type NiveauBudget } from './calculs'
import { supabase } from './supabase'

// --- Bandeau dans l'app ----------------------------------------------------
// Toujours affiché, même si les notifications du téléphone sont refusées.

export interface Annonce {
  titre: string
  corps: string
  niveau: NiveauBudget
}

const ecouteurs = new Set<(a: Annonce) => void>()

export function ecouterAnnonces(f: (a: Annonce) => void): () => void {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

// --- Notifications du téléphone -------------------------------------------

const CLE_PREFERENCE = 'finances.notifications'

export type EtatNotifications = 'non_supportees' | 'refusees' | 'desactivees' | 'actives'

export function etatNotifications(): EtatNotifications {
  if (!('Notification' in window)) return 'non_supportees'
  if (Notification.permission === 'denied') return 'refusees'
  let voulu = false
  try {
    voulu = localStorage.getItem(CLE_PREFERENCE) === '1'
  } catch {
    // Stockage indisponible : on considère les notifications désactivées.
  }
  return Notification.permission === 'granted' && voulu ? 'actives' : 'desactivees'
}

function memoriser(actif: boolean): void {
  try {
    localStorage.setItem(CLE_PREFERENCE, actif ? '1' : '0')
  } catch {
    // Sans stockage, le choix ne survivra pas au rechargement.
  }
}

/** Le service worker n'existe pas en développement : on n'attend pas indéfiniment. */
async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const attente = new Promise<null>((resoudre) => setTimeout(() => resoudre(null), 3000))
  return Promise.race([navigator.serviceWorker.ready, attente])
}

function cleEnOctets(cle: string): Uint8Array<ArrayBuffer> {
  const base64 = (cle + '='.repeat((4 - (cle.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const brut = atob(base64)
  const octets = new Uint8Array(new ArrayBuffer(brut.length))
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i)
  return octets
}

/**
 * Abonne l'appareil aux messages envoyés par le serveur (rappels quand l'app
 * est fermée). Renvoie false si le serveur d'envoi n'est pas encore en place :
 * les alertes affichées pendant l'utilisation fonctionnent quand même.
 */
async function abonnerAuServeur(utilisateurId: string): Promise<boolean> {
  try {
    const { data: cle, error } = await supabase.rpc('cle_push_publique')
    if (error || !cle) return false
    const sw = await serviceWorker()
    if (!sw || !('pushManager' in sw)) return false

    const abonnement =
      (await sw.pushManager.getSubscription()) ??
      (await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(cle as string) }))
    const j = abonnement.toJSON()
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return false

    const { error: erreurEnregistrement } = await supabase.from('abonnements_notifications').upsert(
      {
        utilisateur_id: utilisateurId,
        point_acces: j.endpoint,
        cle_p256dh: j.keys.p256dh,
        cle_auth: j.keys.auth,
        appareil: navigator.userAgent.slice(0, 120),
        supprime_le: null,
      },
      { onConflict: 'utilisateur_id,point_acces' },
    )
    return !erreurEnregistrement
  } catch {
    return false
  }
}

export interface ResultatActivation {
  etat: EtatNotifications
  /** true si l'appareil recevra aussi les rappels quand l'app est fermée. */
  rappelsServeur: boolean
}

export async function activerNotifications(utilisateurId: string): Promise<ResultatActivation> {
  if (!('Notification' in window)) return { etat: 'non_supportees', rappelsServeur: false }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    memoriser(false)
    return { etat: etatNotifications(), rappelsServeur: false }
  }
  memoriser(true)
  const rappelsServeur = await abonnerAuServeur(utilisateurId)
  return { etat: 'actives', rappelsServeur }
}

export async function desactiverNotifications(): Promise<void> {
  memoriser(false)
  try {
    const sw = await serviceWorker()
    const abonnement = await sw?.pushManager?.getSubscription()
    if (abonnement) {
      await supabase
        .from('abonnements_notifications')
        .update({ supprime_le: new Date().toISOString() })
        .eq('point_acces', abonnement.endpoint)
      await abonnement.unsubscribe()
    }
  } catch {
    // Hors ligne : l'abonnement sera désactivé par le serveur au premier envoi refusé.
  }
}

/** Affiche le message dans l'app et, si c'est activé, en notification du téléphone. */
export async function annoncer(annonce: Annonce): Promise<void> {
  ecouteurs.forEach((f) => f(annonce))
  if (etatNotifications() !== 'actives') return
  try {
    const sw = await serviceWorker()
    if (sw) await sw.showNotification(annonce.titre, { body: annonce.corps, icon: '/icone.svg' })
    else new Notification(annonce.titre, { body: annonce.corps, icon: '/icone.svg' })
  } catch {
    // Le bandeau dans l'app a déjà informé l'utilisateur.
  }
}

// --- Alertes de budget ------------------------------------------------------

const GRAVITE: Record<NiveauBudget, number> = { normal: 0, attention: 1, depasse: 2 }

/**
 * Compare le niveau d'un budget avant et après une dépense. Renvoie une annonce
 * seulement si la dépense fait franchir un seuil (80 % ou 100 %).
 */
export function alerteBudget(nom: string, avant: number, apres: number, prevu: number): Annonce | null {
  const niveauAvant = niveauBudget(avant, prevu)
  const niveauApres = niveauBudget(apres, prevu)
  if (GRAVITE[niveauApres] <= GRAVITE[niveauAvant]) return null
  const part = prevu > 0 ? Math.round((apres / prevu) * 100) : 100
  return niveauApres === 'depasse'
    ? { titre: `Budget dépassé : ${nom}`, corps: `Vous êtes à ${part} % du budget prévu.`, niveau: niveauApres }
    : { titre: `Budget bientôt atteint : ${nom}`, corps: `Vous avez utilisé ${part} % du budget prévu.`, niveau: niveauApres }
}
