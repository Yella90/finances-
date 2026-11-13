import { useState, type FormEvent } from 'react'
import { creer } from '../lib/db'
import { aujourdhui } from '../lib/format'
import { useEnLigne, type Donnees } from '../lib/hooks'
import { synchroniser } from '../lib/sync'
import type { Utilisateur } from '../types'

export default function Saisie(props: { profil: Utilisateur; donnees: Donnees; fermer: () => void }) {
  const { profil, donnees, fermer } = props
  const enLigne = useEnLigne()

  const [type, setType] = useState<'depense' | 'revenu'>('depense')
  const [montant, setMontant] = useState('')
  const [categorieId, setCategorieId] = useState<string | null>(donnees.categories[0]?.id ?? null)
  const [sourceId, setSourceId] = useState<string>('')
  const [compteId, setCompteId] = useState(donnees.comptes[0]?.id ?? '')
  const [date, setDate] = useState(aujourdhui())
  const [note, setNote] = useState('')
  const [projetId, setProjetId] = useState('')
  const [ligneId, setLigneId] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const projetsOuverts = donnees.projets.filter((p) => p.statut === 'en_cours')
  const lignesDuProjet = donnees.lignesBudget.filter((l) => l.projet_id === projetId)

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    const valeur = Number(montant.replace(',', '.').replace(/\s/g, ''))
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Entrez un montant supérieur à zéro.')
      return
    }
    if (!compteId) {
      setErreur('Choisissez un compte.')
      return
    }
    await creer('transactions', profil.id, {
      type,
      montant: Math.round(valeur * 100) / 100,
      date_operation: date,
      compte_id: compteId,
      compte_destination_id: null,
      categorie_id: type === 'depense' ? categorieId : null,
      source_revenu_id: type === 'revenu' && sourceId ? sourceId : null,
      projet_id: type === 'depense' && projetId ? projetId : null,
      ligne_budget_id: type === 'depense' && projetId && ligneId ? ligneId : null,
      objectif_id: null,
      regle_recurrente_id: null,
      note: note.trim() || null,
    })
    void synchroniser()
    fermer()
  }

  return (
    <div className="voile" onClick={fermer}>
      <form className="feuille formulaire" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <div className="entete">
          <h2>{type === 'depense' ? 'Nouvelle dépense' : 'Nouveau revenu'}</h2>
          <button type="button" className="icone-bouton" onClick={fermer} aria-label="Fermer">
            ✕
          </button>
        </div>

        {!enLigne && (
          <p className="message attention">Hors ligne. La synchronisation se fera au retour du réseau.</p>
        )}

        <div className="bascule" role="group" aria-label="Type de mouvement">
          <button type="button" className={type === 'depense' ? 'choisie' : ''} onClick={() => setType('depense')}>
            Dépense
          </button>
          <button type="button" className={type === 'revenu' ? 'choisie' : ''} onClick={() => setType('revenu')}>
            Revenu
          </button>
        </div>

        <label className="grand-montant">
          <span className="sr">Montant</span>
          <input
            inputMode="decimal"
            value={montant}
            onChange={(e) => {
              setMontant(e.target.value)
              setErreur(null)
            }}
            placeholder="0"
            autoFocus
          />
          <span>{profil.devise === 'XOF' ? 'FCFA' : profil.devise}</span>
        </label>

        {type === 'depense' ? (
          <fieldset className="choix">
            <legend>Catégorie</legend>
            {donnees.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={categorieId === c.id ? 'puce choisie' : 'puce'}
                onClick={() => setCategorieId(c.id)}
              >
                {c.icone} {c.nom}
              </button>
            ))}
          </fieldset>
        ) : (
          <label>
            Source de revenu
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Autre revenu</option>
              {donnees.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          {type === 'depense' ? 'Payé avec' : 'Reçu sur'}
          <select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
            {donnees.comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>

        {type === 'depense' && projetsOuverts.length > 0 && (
          <div className={projetId && lignesDuProjet.length > 0 ? 'deux' : undefined}>
            <label>
              Projet
              <select
                value={projetId}
                onChange={(e) => {
                  setProjetId(e.target.value)
                  setLigneId('')
                }}
              >
                <option value="">Aucun</option>
                {projetsOuverts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </label>
            {projetId && lignesDuProjet.length > 0 && (
              <label>
                Poste
                <select value={ligneId} onChange={(e) => setLigneId(e.target.value)}>
                  <option value="">Non précisé</option>
                  {lignesDuProjet.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <label>
          Date
          <input type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Taxi pour le marché" />
        </label>

        {erreur && <p className="message erreur">{erreur}</p>}

        <button className="bouton principal" type="submit">
          Enregistrer
        </button>
      </form>
    </div>
  )
}
