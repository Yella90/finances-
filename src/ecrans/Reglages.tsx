import { useMemo, useState, type FormEvent } from 'react'
import { soldesParCompte } from '../lib/calculs'
import { creer, db, supprimer } from '../lib/db'
import { formaterMontant } from '../lib/format'
import { useEtatSync, type Donnees } from '../lib/hooks'
import {
  activerNotifications,
  desactiverNotifications,
  etatNotifications,
  type EtatNotifications,
} from '../lib/notifications'
import { deconnecter } from '../lib/session'
import { synchroniser } from '../lib/sync'
import type { Frequence, TypeCompte, TypeSource, Utilisateur } from '../types'
import SignatureUnitech from './SignatureUnitech'

const TYPES_COMPTE: Record<TypeCompte, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile money',
  banque: 'Banque',
  autre: 'Autre',
}

const TYPES_SOURCE: Record<TypeSource, string> = {
  salaire: 'Salaire',
  commerce: 'Commerce',
  freelance: 'Freelance',
  agriculture: 'Agriculture',
  transfert_recu: 'Transfert reçu',
  tontine: 'Tontine',
  autre: 'Autre',
}

const FREQUENCES: Record<Frequence, string> = {
  mensuel: 'Chaque mois',
  hebdomadaire: 'Chaque semaine',
  annuel: 'Chaque année',
  ponctuel: 'Une seule fois',
  irregulier: 'Irrégulier',
}

function lireMontant(texte: string): number {
  const n = Number(texte.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

export default function Reglages(props: { profil: Utilisateur; donnees: Donnees }) {
  const { profil, donnees } = props
  const argent = (m: number) => formaterMontant(m, profil.devise)
  const soldes = useMemo(
    () => soldesParCompte(donnees.comptes, donnees.transactions),
    [donnees.comptes, donnees.transactions],
  )
  const sync = useEtatSync()

  async function retirerCompte(id: string, nom: string) {
    const utilise = (await db.transactions.where('compte_id').equals(id).toArray()).some((t) => !t.supprime_le)
    if (utilise) {
      window.alert(`« ${nom} » contient des mouvements. Supprimez-les d'abord.`)
      return
    }
    if (!window.confirm(`Supprimer le compte « ${nom} » ?`)) return
    await supprimer('comptes', id)
    void synchroniser()
  }

  async function retirerSource(id: string, nom: string) {
    if (!window.confirm(`Supprimer la source « ${nom} » ?`)) return
    await supprimer('sources_revenu', id)
    void synchroniser()
  }

  async function seDeconnecter() {
    if (sync.enAttente > 0) {
      const ok = window.confirm(
        `${sync.enAttente} modification(s) ne sont pas encore synchronisées et seront perdues. Se déconnecter quand même ?`,
      )
      if (!ok) return
    }
    await deconnecter()
  }

  return (
    <>
      <header className="entete">
        <h1>Réglages</h1>
      </header>

      <section className="carte">
        <h2>Comptes</h2>
        <ul className="liste">
          {donnees.comptes.map((c) => (
            <li className="mouvement" key={c.id}>
              <div className="texte">
                <strong>{c.nom}</strong>
                <small>{TYPES_COMPTE[c.type]}</small>
              </div>
              <span className="montant">{argent(soldes.get(c.id) ?? 0)}</span>
              <button className="icone-bouton" onClick={() => retirerCompte(c.id, c.nom)} aria-label={`Supprimer ${c.nom}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <FormulaireCompte profil={profil} />
      </section>

      <section className="carte">
        <h2>Sources de revenu</h2>
        {donnees.sources.length === 0 && <p className="discret">Salaire, commerce, transferts reçus…</p>}
        <ul className="liste">
          {donnees.sources.map((s) => (
            <li className="mouvement" key={s.id}>
              <div className="texte">
                <strong>{s.nom}</strong>
                <small>
                  {TYPES_SOURCE[s.type]} · {FREQUENCES[s.frequence]}
                </small>
              </div>
              <span className="montant">{s.montant_prevu != null ? argent(Number(s.montant_prevu)) : ''}</span>
              <button className="icone-bouton" onClick={() => retirerSource(s.id, s.nom)} aria-label={`Supprimer ${s.nom}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <FormulaireSource profil={profil} donnees={donnees} />
      </section>

      <SectionNotifications profil={profil} />

      <section className="carte">
        <h2>Synchronisation</h2>
        <p className="discret">
          {sync.enAttente > 0
            ? `${sync.enAttente} modification(s) en attente d'envoi.`
            : 'Toutes vos données sont envoyées.'}
        </p>
        {sync.erreur && <p className="message erreur">Dernière erreur : {sync.erreur}</p>}
        <button className="bouton" onClick={() => void synchroniser()} disabled={sync.enCours}>
          {sync.enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
      </section>

      <section className="carte">
        <h2>Profil</h2>
        <dl className="profil">
          <dt>Nom</dt>
          <dd>{profil.nom_complet}</dd>
          <dt>Email</dt>
          <dd>{profil.email ?? '—'}</dd>
          <dt>Téléphone</dt>
          <dd>{profil.telephone ?? '—'}</dd>
          <dt>Devise</dt>
          <dd>{profil.devise}</dd>
        </dl>
        <button className="bouton" onClick={seDeconnecter}>
          Se déconnecter
        </button>
      </section>

      <SignatureUnitech />
    </>
  )
}

function SectionNotifications({ profil }: { profil: Utilisateur }) {
  const [etat, setEtat] = useState<EtatNotifications>(etatNotifications)
  const [info, setInfo] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function activer() {
    setEnCours(true)
    const resultat = await activerNotifications(profil.id)
    setEtat(resultat.etat)
    setInfo(
      resultat.etat !== 'actives'
        ? null
        : resultat.rappelsServeur
          ? 'Cet appareil recevra les alertes de budget et les rappels.'
          : 'Les alertes de budget sont actives. Les rappels quand l\'app est fermée arriveront plus tard.',
    )
    setEnCours(false)
  }

  async function desactiver() {
    setEnCours(true)
    await desactiverNotifications()
    setEtat(etatNotifications())
    setInfo(null)
    setEnCours(false)
  }

  return (
    <section className="carte">
      <h2>Notifications</h2>
      {etat === 'non_supportees' && (
        <p className="discret">
          Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d'abord l'app à l'écran d'accueil.
        </p>
      )}
      {etat === 'refusees' && (
        <p className="discret">
          Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis
          revenez ici.
        </p>
      )}
      {etat === 'desactivees' && (
        <>
          <p className="discret">
            Recevez une alerte quand un budget atteint 80 % ou est dépassé. Les alertes s'affichent toujours
            dans l'app, même sans cette option.
          </p>
          <button className="bouton principal" onClick={activer} disabled={enCours}>
            Activer les notifications
          </button>
        </>
      )}
      {etat === 'actives' && (
        <>
          <p className="discret">{info ?? 'Les notifications sont actives sur cet appareil.'}</p>
          <button className="bouton" onClick={desactiver} disabled={enCours}>
            Désactiver
          </button>
        </>
      )}
    </section>
  )
}

function FormulaireCompte({ profil }: { profil: Utilisateur }) {
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeCompte>('especes')
  const [solde, setSolde] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    const soldeInitial = solde.trim() === '' ? 0 : lireMontant(solde)
    if (Number.isNaN(soldeInitial)) {
      setErreur('Le solde de départ doit être un nombre.')
      return
    }
    await creer('comptes', profil.id, { nom: nom.trim(), type, solde_initial: soldeInitial, archive: false })
    setNom('')
    setSolde('')
    setErreur(null)
    void synchroniser()
  }

  return (
    <form className="formulaire ajout-ligne" onSubmit={ajouter}>
      <label>
        Nom du compte
        <input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Orange Money" />
      </label>
      <div className="deux">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as TypeCompte)}>
            {Object.entries(TYPES_COMPTE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </label>
        <label>
          Solde de départ
          <input inputMode="decimal" value={solde} onChange={(e) => setSolde(e.target.value)} placeholder="0" />
        </label>
      </div>
      {erreur && <p className="message erreur">{erreur}</p>}
      <button className="bouton" type="submit">
        Ajouter le compte
      </button>
    </form>
  )
}

function FormulaireSource({ profil, donnees }: { profil: Utilisateur; donnees: Donnees }) {
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeSource>('salaire')
  const [frequence, setFrequence] = useState<Frequence>('mensuel')
  const [montant, setMontant] = useState('')
  const [compteId, setCompteId] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    const prevu = montant.trim() === '' ? null : lireMontant(montant)
    if (prevu !== null && (Number.isNaN(prevu) || prevu < 0)) {
      setErreur('Le montant prévu doit être un nombre positif.')
      return
    }
    await creer('sources_revenu', profil.id, {
      nom: nom.trim(),
      type,
      frequence,
      montant_prevu: prevu,
      compte_id: compteId || null,
      actif: true,
    })
    setNom('')
    setMontant('')
    setErreur(null)
    void synchroniser()
  }

  return (
    <form className="formulaire ajout-ligne" onSubmit={ajouter}>
      <label>
        Nom de la source
        <input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Salaire" />
      </label>
      <div className="deux">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as TypeSource)}>
            {Object.entries(TYPES_SOURCE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fréquence
          <select value={frequence} onChange={(e) => setFrequence(e.target.value as Frequence)}>
            {Object.entries(FREQUENCES).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="deux">
        <label>
          Montant prévu
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="150000" />
        </label>
        <label>
          Reçu sur
          <select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
            <option value="">Non précisé</option>
            {donnees.comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erreur && <p className="message erreur">{erreur}</p>}
      <button className="bouton" type="submit">
        Ajouter la source
      </button>
    </form>
  )
}
