import { useState, type FormEvent } from 'react'
import { connecter, inscrire } from '../lib/session'
import { DEVISES } from '../lib/format'
import SignatureUnitech from './SignatureUnitech'
import { EDITEUR } from '../lib/editeur'

export default function Auth() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [devise, setDevise] = useState('XOF')
  const [langue, setLangue] = useState<'fr' | 'bm'>('fr')
  const [accord, setAccord] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      if (mode === 'connexion') {
        await connecter(email, motDePasse)
      } else {
        await inscrire({
          email,
          motDePasse,
          nomComplet: nom,
          telephone,
          devise,
          langue,
          // Version des conditions acceptées, enregistrée avec le compte.
          versionConditions: EDITEUR.derniereMiseAJour,
        })
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      setEnvoi(false)
    }
  }

  const inscription = mode === 'inscription'

  return (
    <main className="auth">
      <div className="marque">
        <img src="/icone.svg" alt="" width="56" height="56" />
        <h1>Finances</h1>
        <p>Vos revenus, vos dépenses et votre épargne, même sans connexion.</p>
      </div>

      <form className="carte formulaire" onSubmit={soumettre}>
        <h2>{inscription ? 'Créer votre compte' : 'Se connecter'}</h2>

        {inscription && (
          <label>
            Nom complet
            <input value={nom} onChange={(e) => setNom(e.target.value)} required autoComplete="name" />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="nom@exemple.com"
          />
        </label>

        {inscription && (
          <label>
            Téléphone
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              autoComplete="tel"
              placeholder="+223 70 00 00 00"
            />
          </label>
        )}

        <label>
          Mot de passe
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
            minLength={inscription ? 8 : undefined}
            autoComplete={inscription ? 'new-password' : 'current-password'}
          />
          {inscription && (
            <span className="aide">
              Au moins 8 caractères. Notez-le bien : il ne peut pas encore être réinitialisé si vous l'oubliez.
            </span>
          )}
        </label>

        {inscription && (
          <>
            <label>
              Devise
              <select value={devise} onChange={(e) => setDevise(e.target.value)}>
                {DEVISES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="choix">
              <legend>Langue</legend>
              <button type="button" className={langue === 'fr' ? 'puce choisie' : 'puce'} onClick={() => setLangue('fr')}>
                Français
              </button>
              <button type="button" className={langue === 'bm' ? 'puce choisie' : 'puce'} onClick={() => setLangue('bm')}>
                Bamanankan
              </button>
            </fieldset>
            {langue === 'bm' && (
              <p className="discret">La traduction en bamanankan arrive bientôt. En attendant, l'app s'affiche en français.</p>
            )}
          </>
        )}

        {inscription && (
          <label className="accord">
            <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} required />
            <span>
              J'accepte les <a href="#conditions">conditions d'utilisation</a> et la{' '}
              <a href="#confidentialite">politique de confidentialité et cookies</a>.
            </span>
          </label>
        )}

        {erreur && <p className="message erreur">{erreur}</p>}

        <button className="bouton principal" type="submit" disabled={envoi}>
          {envoi ? 'Un instant…' : inscription ? 'Créer mon compte' : 'Se connecter'}
        </button>

        <button
          type="button"
          className="lien"
          onClick={() => {
            setMode(inscription ? 'connexion' : 'inscription')
            setErreur(null)
          }}
        >
          {inscription ? 'J\'ai déjà un compte' : 'Créer un compte'}
        </button>
      </form>

      <SignatureUnitech />
    </main>
  )
}
