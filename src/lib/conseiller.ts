// Conseiller IA.
//
// Principe : l'app calcule, l'IA explique. Tous les chiffres envoyés ici sont
// déjà calculés par l'app ; l'IA ne fait que les commenter. Les clés des
// fournisseurs d'IA restent sur le serveur UNITECH, jamais dans l'app.

import {
  depensesDesProjets,
  depensesParCategorie,
  epargneParObjectif,
  niveauBudget,
  soldesParCompte,
  suiviObjectif,
  totauxParMois,
} from './calculs'
import { derniersMois } from './format'
import type { Donnees } from './hooks'
import { lireSessionStockee } from './jeton'
import { historiqueMensuel, revenuMensuelDeclare, simuler } from './simulation'
import type { ObjectifEpargne, Utilisateur } from '../types'

const URL_CONSEILLER =
  (import.meta.env.VITE_CONSEILLER_URL as string | undefined) ?? 'https://unitech-qvgo.onrender.com/api/ai/finances'

export type TypeDemande = 'bilan' | 'objectif' | 'depense'

// --- Accord de l'utilisateur ------------------------------------------------

const CLE_ACCORD = 'finances.conseiller.accord'

export function accordDonne(): boolean {
  try {
    return localStorage.getItem(CLE_ACCORD) === '1'
  } catch {
    return false
  }
}

export function donnerAccord(): void {
  try {
    localStorage.setItem(CLE_ACCORD, '1')
  } catch {
    // Sans stockage, l'accord sera redemandé à la prochaine ouverture.
  }
}

// --- Appel du conseiller ----------------------------------------------------

/** Le serveur peut être endormi : la première réponse prend parfois une minute. */
const DELAI_MAX_MS = 100_000

export async function demanderConseil(type: TypeDemande, donnees: unknown, question = ''): Promise<string> {
  const jeton = lireSessionStockee()?.jeton
  if (!jeton) throw new Error('Reconnectez-vous pour utiliser le conseiller.')
  if (!navigator.onLine) throw new Error('Le conseiller a besoin d\'une connexion. Les chiffres ci-dessus restent valables.')

  const arret = new AbortController()
  const minuteur = window.setTimeout(() => arret.abort(), DELAI_MAX_MS)
  try {
    const reponse = await fetch(URL_CONSEILLER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jeton-session': jeton },
      body: JSON.stringify({ type, donnees, question }),
      signal: arret.signal,
    })
    const corps = (await reponse.json().catch(() => null)) as { contenu?: string; erreur?: string } | null
    if (!reponse.ok || !corps?.contenu) {
      throw new Error(corps?.erreur ?? 'Le conseiller est indisponible pour le moment.')
    }
    return corps.contenu
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Le conseiller met trop de temps à répondre. Réessayez dans un instant.')
    }
    if (e instanceof TypeError) throw new Error('Impossible de joindre le conseiller. Réessayez dans un instant.')
    throw e
  } finally {
    window.clearTimeout(minuteur)
  }
}

// --- Données envoyées -------------------------------------------------------
// Uniquement des totaux et des noms de catégories, d'objectifs et de projets.
// Jamais les notes des mouvements, ni le nom, l'email ou le téléphone.

const arrondi = (n: number) => Math.round(n)

function resumeCommun(profil: Utilisateur, donnees: Donnees) {
  const [moisPrecedent, moisCourant] = derniersMois(2)
  const [precedent, courant] = totauxParMois(donnees.transactions, [moisPrecedent, moisCourant])
  const soldes = soldesParCompte(donnees.comptes, donnees.transactions)
  const soldeDisponible = [...soldes.values()].reduce((a, b) => a + b, 0)
  const maintenant = new Date()
  const joursDansLeMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0).getDate()
  // Jours qu'il reste à vivre ce mois-ci, aujourd'hui compris.
  const joursRestants = joursDansLeMois - maintenant.getDate() + 1

  const categories = depensesParCategorie(donnees.transactions, moisCourant)
    .slice(0, 6)
    .map((c) => ({
      categorie: donnees.categories.find((x) => x.id === c.categorieId)?.nom ?? 'Sans catégorie',
      total: arrondi(c.total),
      part_des_depenses_pourcent: courant.depenses > 0 ? arrondi((c.total / courant.depenses) * 100) : 0,
    }))

  const epargne = epargneParObjectif(donnees.transactions)
  const objectifs = donnees.objectifs.map((o) => {
    const s = suiviObjectif(o, epargne.get(o.id) ?? 0)
    return {
      nom: o.nom,
      montant_cible: arrondi(Number(o.montant_cible)),
      deja_epargne: arrondi(s.epargne),
      reste: arrondi(s.reste),
      date_cible: o.date_cible,
      effort_mensuel_necessaire: s.effortMensuel,
      retard_sur_le_rythme: s.retard,
      atteint: s.atteint,
    }
  })

  const depensesProjets = depensesDesProjets(donnees.transactions)
  const projets = donnees.projets
    .filter((p) => p.statut === 'en_cours')
    .map((p) => {
      const depense = depensesProjets.parProjet.get(p.id) ?? 0
      return {
        nom: p.nom,
        budget: arrondi(Number(p.budget_total)),
        depense: arrondi(depense),
        etat: niveauBudget(depense, Number(p.budget_total)),
      }
    })

  return {
    devise: profil.devise,
    jour_du_mois: maintenant.getDate(),
    jours_dans_le_mois: joursDansLeMois,
    jours_restants_ce_mois: joursRestants,
    solde_disponible: arrondi(soldeDisponible),
    // Calculés ici pour que l'IA n'ait aucune opération à faire.
    solde_disponible_par_jour_restant: arrondi(soldeDisponible / joursRestants),
    mois_en_cours: {
      revenus: arrondi(courant.revenus),
      depenses: arrondi(courant.depenses),
      revenus_moins_depenses: arrondi(courant.revenus - courant.depenses),
    },
    depenses_par_rapport_au_mois_precedent: arrondi(courant.depenses - precedent.depenses),
    mois_precedent: { revenus: arrondi(precedent.revenus), depenses: arrondi(precedent.depenses) },
    revenu_mensuel_declare: revenuMensuelDeclare(donnees.sources),
    depenses_du_mois_par_categorie: categories,
    objectifs_epargne: objectifs,
    projets_en_cours: projets,
  }
}

export function donneesBilan(profil: Utilisateur, donnees: Donnees) {
  return resumeCommun(profil, donnees)
}

export function donneesObjectif(profil: Utilisateur, donnees: Donnees, objectif: ObjectifEpargne) {
  const commun = resumeCommun(profil, donnees)
  const s = suiviObjectif(objectif, epargneParObjectif(donnees.transactions).get(objectif.id) ?? 0)

  // La simulation n'est jointe que si l'historique suffit : sinon elle
  // reposerait sur des estimations que l'utilisateur n'a pas saisies ici.
  const historique = historiqueMensuel(donnees.transactions)
  let simulation: Record<string, number | null> | null = null
  if (historique.length >= 3 && s.effortMensuel && s.joursRestants > 0) {
    const r = simuler({
      modele: { type: 'historique', mois: historique },
      soldeDepart: commun.solde_disponible,
      resteAEpargner: s.reste,
      versementMensuel: s.effortMensuel,
      nombreMois: Math.max(1, Math.ceil(s.joursRestants / 30.44)),
    })
    simulation = {
      chance_de_reussite_pourcent: arrondi(r.chance),
      risque_de_solde_negatif_pourcent: arrondi(r.risqueSoldeNegatif),
      mois_necessaires_cas_moyen: r.moisMedian,
    }
  }

  return {
    ...commun,
    objectif_concerne: {
      nom: objectif.nom,
      montant_cible: arrondi(Number(objectif.montant_cible)),
      deja_epargne: arrondi(s.epargne),
      reste: arrondi(s.reste),
      date_cible: objectif.date_cible,
      jours_restants: s.joursRestants,
      effort_mensuel_necessaire: s.effortMensuel,
      retard_sur_le_rythme: s.retard,
    },
    simulation,
  }
}

export interface DepenseEnvisagee {
  montant: number
  categorieId: string | null
  projetId: string | null
}

export interface PreAnalyse {
  soldeAvant: number
  soldeApres: number
  depensesMoisAvant: number
  depensesMoisApres: number
  revenusMois: number
  /** Part du revenu mensuel de référence que représente la dépense, ou null si inconnu. */
  partDuRevenu: number | null
  projet: { nom: string; budget: number; depenseAvant: number; depenseApres: number; etatApres: string } | null
  /** Total des efforts mensuels d'épargne encore à fournir. */
  effortEpargneMensuel: number
  /** Ce qui resterait ce mois-ci pour épargner, après cette dépense. */
  resteDuMoisApres: number
}

/** Effet d'une dépense envisagée, calculé par l'app avant tout avis de l'IA. */
export function preAnalyser(donnees: Donnees, d: DepenseEnvisagee): PreAnalyse {
  const [moisCourant] = derniersMois(1)
  const [courant] = totauxParMois(donnees.transactions, [moisCourant])
  const soldeAvant = [...soldesParCompte(donnees.comptes, donnees.transactions).values()].reduce((a, b) => a + b, 0)
  const revenuReference = Math.max(courant.revenus, revenuMensuelDeclare(donnees.sources))

  const projetChoisi = donnees.projets.find((p) => p.id === d.projetId)
  const depenseProjet = projetChoisi ? depensesDesProjets(donnees.transactions).parProjet.get(projetChoisi.id) ?? 0 : 0

  const epargne = epargneParObjectif(donnees.transactions)
  const effortEpargneMensuel = donnees.objectifs.reduce((total, o) => {
    const s = suiviObjectif(o, epargne.get(o.id) ?? 0)
    return total + (s.atteint ? 0 : s.effortMensuel ?? 0)
  }, 0)

  return {
    soldeAvant: arrondi(soldeAvant),
    soldeApres: arrondi(soldeAvant - d.montant),
    depensesMoisAvant: arrondi(courant.depenses),
    depensesMoisApres: arrondi(courant.depenses + d.montant),
    revenusMois: arrondi(courant.revenus),
    partDuRevenu: revenuReference > 0 ? arrondi((d.montant / revenuReference) * 100) : null,
    projet: projetChoisi
      ? {
          nom: projetChoisi.nom,
          budget: arrondi(Number(projetChoisi.budget_total)),
          depenseAvant: arrondi(depenseProjet),
          depenseApres: arrondi(depenseProjet + d.montant),
          etatApres: niveauBudget(depenseProjet + d.montant, Number(projetChoisi.budget_total)),
        }
      : null,
    effortEpargneMensuel: arrondi(effortEpargneMensuel),
    resteDuMoisApres: arrondi(revenuReference - courant.depenses - d.montant),
  }
}

export function donneesDepense(profil: Utilisateur, donnees: Donnees, d: DepenseEnvisagee, analyse: PreAnalyse) {
  return {
    ...resumeCommun(profil, donnees),
    depense_envisagee: {
      montant: arrondi(d.montant),
      categorie: donnees.categories.find((c) => c.id === d.categorieId)?.nom ?? 'Non précisée',
    },
    effet_calcule: {
      solde_disponible_avant: analyse.soldeAvant,
      solde_disponible_apres: analyse.soldeApres,
      depenses_du_mois_avant: analyse.depensesMoisAvant,
      depenses_du_mois_apres: analyse.depensesMoisApres,
      la_depense_envisagee_represente_pourcent_du_revenu_mensuel: analyse.partDuRevenu,
      budget_du_projet: analyse.projet,
      effort_epargne_mensuel_total: analyse.effortEpargneMensuel,
      revenu_du_mois_moins_toutes_les_depenses_apres: analyse.resteDuMoisApres,
    },
  }
}
