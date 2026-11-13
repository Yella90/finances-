import { useEffect, useState } from 'react'
import { configurationManquante } from './lib/supabase'
import { ecouterSession, lireSession, verifierSession } from './lib/session'
import { demarrerSyncAuto } from './lib/sync'
import { useDonnees } from './lib/hooks'
import type { Utilisateur } from './types'
import Auth from './ecrans/Auth'
import Accueil from './ecrans/Accueil'
import Transactions from './ecrans/Transactions'
import Reglages from './ecrans/Reglages'
import Plans from './ecrans/Plans'
import Saisie from './ecrans/Saisie'
import Legal from './ecrans/Legal'
import Conseiller from './ecrans/Conseiller'
import { lirePageLegale } from './lib/editeur'
import { ecouterAnnonces, type Annonce } from './lib/notifications'

type Onglet = 'accueil' | 'transactions' | 'plans' | 'reglages'

export default function App() {
  const [pageLegale, setPageLegale] = useState(() => lirePageLegale(window.location.hash))

  useEffect(() => {
    const surChangement = () => setPageLegale(lirePageLegale(window.location.hash))
    window.addEventListener('hashchange', surChangement)
    return () => window.removeEventListener('hashchange', surChangement)
  }, [])

  // La page légale s'affiche par-dessus : l'écran en dessous garde son état
  // (un formulaire d'inscription en cours n'est pas perdu).
  return (
    <>
      <Contenu />
      {pageLegale && (
        <Legal
          page={pageLegale}
          fermer={() => {
            window.history.replaceState(null, '', window.location.pathname)
            setPageLegale(null)
          }}
        />
      )}
    </>
  )
}

function Contenu() {
  const [session, setSession] = useState(lireSession)
  const [onglet, setOnglet] = useState<Onglet>('accueil')
  const [saisieOuverte, setSaisieOuverte] = useState(false)

  useEffect(() => ecouterSession(setSession), [])

  const utilisateurId = session?.utilisateur.id
  useEffect(() => {
    if (!utilisateurId) return
    let arreterSync: (() => void) | undefined
    let annule = false
    // On confirme d'abord que la session est encore valable côté serveur.
    // Hors ligne, la session locale suffit pour continuer à travailler.
    verifierSession().then((valable) => {
      if (valable && !annule) arreterSync = demarrerSyncAuto()
    })
    return () => {
      annule = true
      arreterSync?.()
    }
  }, [utilisateurId])

  if (configurationManquante) {
    return (
      <main className="centre">
        <h1>Configuration manquante</h1>
        <p>Copiez .env.example en .env.local et renseignez l'adresse et la clé Supabase.</p>
      </main>
    )
  }

  if (!session) return <Auth />

  return (
    <Application
      profil={session.utilisateur}
      onglet={onglet}
      setOnglet={setOnglet}
      saisieOuverte={saisieOuverte}
      setSaisieOuverte={setSaisieOuverte}
    />
  )
}

function Application(props: {
  profil: Utilisateur
  onglet: Onglet
  setOnglet: (o: Onglet) => void
  saisieOuverte: boolean
  setSaisieOuverte: (b: boolean) => void
}) {
  const { profil, onglet, setOnglet, saisieOuverte, setSaisieOuverte } = props
  const donnees = useDonnees()
  const [annonce, setAnnonce] = useState<Annonce | null>(null)
  const [conseillerOuvert, setConseillerOuvert] = useState(false)

  useEffect(() => ecouterAnnonces(setAnnonce), [])
  useEffect(() => {
    if (!annonce) return
    const minuteur = window.setTimeout(() => setAnnonce(null), 8000)
    return () => window.clearTimeout(minuteur)
  }, [annonce])

  return (
    <div className="app">
      {annonce && (
        <div className={`annonce ${annonce.niveau}`} role="alert">
          <div>
            <strong>{annonce.titre}</strong>
            <p>{annonce.corps}</p>
          </div>
          <button className="icone-bouton" onClick={() => setAnnonce(null)} aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
      <main className="contenu">
        {onglet === 'accueil' && (
          <Accueil
            profil={profil}
            donnees={donnees}
            allerAuxReglages={() => setOnglet('reglages')}
            ouvrirConseiller={() => setConseillerOuvert(true)}
          />
        )}
        {onglet === 'transactions' && <Transactions profil={profil} donnees={donnees} />}
        {onglet === 'plans' && <Plans profil={profil} donnees={donnees} />}
        {onglet === 'reglages' && <Reglages profil={profil} donnees={donnees} />}
      </main>

      <nav className="barre" aria-label="Navigation principale">
        <button className={onglet === 'accueil' ? 'actif' : ''} onClick={() => setOnglet('accueil')}>
          <span aria-hidden="true">◧</span>
          Accueil
        </button>
        <button className={onglet === 'transactions' ? 'actif' : ''} onClick={() => setOnglet('transactions')}>
          <span aria-hidden="true">☰</span>
          Mouvements
        </button>
        <button
          className="ajout"
          onClick={() => setSaisieOuverte(true)}
          disabled={donnees.comptes.length === 0}
          aria-label="Ajouter un mouvement"
        >
          +
        </button>
        <button className={onglet === 'plans' ? 'actif' : ''} onClick={() => setOnglet('plans')}>
          <span aria-hidden="true">◎</span>
          Plans
        </button>
        <button className={onglet === 'reglages' ? 'actif' : ''} onClick={() => setOnglet('reglages')}>
          <span aria-hidden="true">⚙</span>
          Réglages
        </button>
      </nav>

      {conseillerOuvert && (
        <Conseiller profil={profil} donnees={donnees} fermer={() => setConseillerOuvert(false)} />
      )}
      {saisieOuverte && <Saisie profil={profil} donnees={donnees} fermer={() => setSaisieOuverte(false)} />}
    </div>
  )
}
