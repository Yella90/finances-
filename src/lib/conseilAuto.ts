// Conseil automatique : une fois l'accord donné, l'app demande d'elle-même un
// bilan au conseiller et le garde sur l'appareil, pour qu'il s'affiche dès
// l'ouverture, même sans connexion.

import { useCallback, useEffect, useRef, useState } from 'react'
import { accordDonne, demanderConseil, donneesBilan } from './conseiller'
import { ecrireMeta, lireMeta } from './db'
import type { Donnees } from './hooks'
import type { Utilisateur } from '../types'

interface ConseilGarde {
  utilisateurId: string
  contenu: string
  /** Date et heure de la réponse. */
  recuLe: string
  /** Résumé des données au moment de la demande, pour savoir si elles ont changé. */
  empreinte: string
}

const CLE = 'conseil_auto'
/** Délai minimal entre deux demandes automatiques quand les données changent. */
const DELAI_MINIMAL_MS = 6 * 60 * 60 * 1000

function empreinteDonnees(donnees: Donnees): string {
  const total = donnees.transactions.reduce((s, t) => s + Number(t.montant), 0)
  return [donnees.transactions.length, Math.round(total), donnees.objectifs.length, donnees.projets.length].join(':')
}

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export interface ConseilAuto {
  contenu: string | null
  recuLe: string | null
  chargement: boolean
  erreur: string | null
  /** false tant que l'utilisateur n'a pas accepté l'envoi de ses chiffres. */
  actif: boolean
  actualiser: () => void
}

export function useConseilAuto(profil: Utilisateur, donnees: Donnees): ConseilAuto {
  const actif = accordDonne()
  const [garde, setGarde] = useState<ConseilGarde | null>(null)
  const [charge, setCharge] = useState(false)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const enCours = useRef(false)

  // Le dernier conseil reçu s'affiche tout de suite, avant toute requête.
  useEffect(() => {
    let annule = false
    lireMeta<ConseilGarde>(CLE).then((c) => {
      if (annule) return
      setGarde(c && c.utilisateurId === profil.id ? c : null)
      setCharge(true)
    })
    return () => {
      annule = true
    }
  }, [profil.id])

  const empreinte = empreinteDonnees(donnees)
  // Les données changent à chaque saisie : on lit la dernière version au moment de la demande.
  const dernieres = useRef({ profil, donnees })
  dernieres.current = { profil, donnees }

  const demander = useCallback(
    async (manuel: boolean) => {
      if (enCours.current) return
      enCours.current = true
      setChargement(true)
      setErreur(null)
      try {
        const { profil: p, donnees: d } = dernieres.current
        const contenu = await demanderConseil('bilan', donneesBilan(p, d))
        const nouveau: ConseilGarde = {
          utilisateurId: p.id,
          contenu,
          recuLe: new Date().toISOString(),
          empreinte: empreinteDonnees(d),
        }
        await ecrireMeta(CLE, nouveau)
        setGarde(nouveau)
      } catch (e) {
        // Une demande automatique qui échoue reste discrète : l'ancien conseil suffit.
        if (manuel) setErreur(e instanceof Error ? e.message : String(e))
      } finally {
        enCours.current = false
        setChargement(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!actif || !charge || !donnees.pret || !navigator.onLine) return
    // Sans aucun mouvement, il n'y a rien à commenter.
    if (donnees.transactions.length === 0) return

    const maintenant = new Date()
    const dernier = garde ? new Date(garde.recuLe) : null
    const perime =
      !dernier ||
      !memeJour(dernier, maintenant) ||
      (garde!.empreinte !== empreinte && maintenant.getTime() - dernier.getTime() > DELAI_MINIMAL_MS)
    if (perime) void demander(false)
    // « garde » change après chaque réponse : la condition est alors réévaluée et s'arrête là.
  }, [actif, charge, donnees.pret, donnees.transactions.length, empreinte, garde, demander])

  return {
    contenu: garde?.contenu ?? null,
    recuLe: garde?.recuLe ?? null,
    chargement,
    erreur,
    actif,
    actualiser: () => void demander(true),
  }
}
