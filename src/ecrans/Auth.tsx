import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { DEVISES } from '../lib/format'
import SignatureUnitech from './SignatureUnitech'

function traduireErreur(message: string): string {
  if (/Invalid login credentials/i.test(message)) return 'Email ou mot de passe incorrect.'
  if (/already registered/i.test(message)) return 'Un compte existe déjà avec cet email. Connectez-vous.'
  if (/Email not confirmed/i.test(message)) return 'Confirmez votre email avant de vous connecter.'
  if (/at least 6/i.test(message)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/fetch/i.test(message)) return 'Pas de connexion. Réessayez quand le réseau revient.'
  return message
}

export default function Auth() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [devise, setDevise] = useState('XOF')
  const [langue, setLangue] = useState<'fr' | 'bm'>('fr')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setInfo(null)
    setEnvoi(true)
    try {
      if (mode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: motDePasse,
          options: {
            data: { nom_complet: nom.trim(), telephone: telephone.trim(), devise, langue, application: 'finances' },
          },
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Compte créé. Ouvrez le lien reçu par email pour le confirmer, puis connectez-vous.')
          setMode('connexion')
        }
      }
    } catch (err) {
      setErreur(traduireErreur(err instanceof Error ? err.message : String(err)))
    } finally {
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
            minLength={6}
            autoComplete={inscription ? 'new-password' : 'current-password'}
          />
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

        {erreur && <p className="message erreur">{erreur}</p>}
        {info && <p className="message succes">{info}</p>}

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
