import { useMemo, useState, type FormEvent } from 'react'
import { epargneParObjectif, suiviObjectif } from '../lib/calculs'
import { creer, supprimer } from '../lib/db'
import { aujourdhui, formaterMontant, nomMois } from '../lib/format'
import type { Donnees } from '../lib/hooks'
import { annoncer } from '../lib/notifications'
import { synchroniser } from '../lib/sync'
import type { ObjectifEpargne, Utilisateur } from '../types'

const ICONES = ['🎯', '🏍️', '🏠', '🎓', '🛡️', '🎉', '✈️', '📦']

function lireMontant(texte: string): number {
  const n = Number(texte.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

export default function Objectifs(props: { profil: Utilisateur; donnees: Donnees }) {
  const { profil, donnees } = props
  const argent = (m: number) => formaterMontant(m, profil.devise)
  const epargne = useMemo(() => epargneParObjectif(donnees.transactions), [donnees.transactions])
  const [versementPour, setVersementPour] = useState<string | null>(null)

  const totalEpargne = donnees.objectifs.reduce((s, o) => s + (epargne.get(o.id) ?? 0), 0)

  async function retirer(objectif: ObjectifEpargne) {
    const versements = donnees.transactions.filter((t) => t.objectif_id === objectif.id)
    const message =
      versements.length > 0
        ? `Supprimer l'objectif « ${objectif.nom} » ? Ses ${versements.length} versement(s) seront annulés et l'argent reviendra dans vos comptes.`
        : `Supprimer l'objectif « ${objectif.nom} » ?`
    if (!window.confirm(message)) return
    for (const t of versements) await supprimer('transactions', t.id)
    await supprimer('objectifs_epargne', objectif.id)
    void synchroniser()
  }

  return (
    <>
      {donnees.objectifs.length > 0 && (
        <section className="solde">
          <p>Total mis de côté</p>
          <strong>{argent(totalEpargne)}</strong>
        </section>
      )}

      {donnees.pret && donnees.objectifs.length === 0 && (
        <section className="carte vide">
          <h2>Fixez-vous un objectif d'épargne</h2>
          <p>
            Une moto, un fonds d'urgence, une fête : indiquez le montant et la date, l'app calcule combien
            mettre de côté chaque mois.
          </p>
        </section>
      )}

      {donnees.objectifs.map((o) => {
        const s = suiviObjectif(o, epargne.get(o.id) ?? 0)
        return (
          <section className="carte" key={o.id}>
            <div className="ligne">
              <strong>
                {o.icone} {o.nom}
              </strong>
              {s.atteint ? (
                <span className="etiquette reussi">Atteint</span>
              ) : s.retard > 0 ? (
                <span className="etiquette attention">En retard</span>
              ) : null}
              <button className="icone-bouton" onClick={() => retirer(o)} aria-label={`Supprimer ${o.nom}`}>
                ✕
              </button>
            </div>

            <div className="jauge haute">
              <span className={s.retard > 0 && !s.atteint ? 'attention' : 'normal'} style={{ width: `${s.part}%` }} />
            </div>

            <div className="ligne discret">
              <span>
                {argent(s.epargne)} sur {argent(Number(o.montant_cible))}
              </span>
              <span>{Math.round(s.part)} %</span>
            </div>

            {!s.atteint && (
              <p className="discret">
                {o.date_cible ? (
                  s.joursRestants > 0 ? (
                    <>
                      Mettez de côté <strong>{argent(s.effortMensuel ?? 0)} par mois</strong> jusqu'en{' '}
                      {nomMois(o.date_cible.slice(0, 7))}.
                    </>
                  ) : (
                    <>La date prévue est passée. Il manque encore {argent(s.reste)}.</>
                  )
                ) : (
                  <>Il reste {argent(s.reste)} à mettre de côté.</>
                )}
                {s.retard > 0 && s.joursRestants > 0 && <> Vous avez {argent(s.retard)} de retard sur le rythme prévu.</>}
              </p>
            )}

            {versementPour === o.id ? (
              <FormulaireVersement
                profil={profil}
                donnees={donnees}
                objectif={o}
                dejaEpargne={s.epargne}
                fermer={() => setVersementPour(null)}
              />
            ) : (
              !s.atteint && (
                <button
                  className="bouton"
                  onClick={() => setVersementPour(o.id)}
                  disabled={donnees.comptes.length === 0}
                >
                  Verser de l'argent
                </button>
              )
            )}
          </section>
        )
      })}

      <section className="carte">
        <h2>Nouvel objectif</h2>
        <FormulaireObjectif profil={profil} />
      </section>
    </>
  )
}

function FormulaireVersement(props: {
  profil: Utilisateur
  donnees: Donnees
  objectif: ObjectifEpargne
  dejaEpargne: number
  fermer: () => void
}) {
  const { profil, donnees, objectif, dejaEpargne, fermer } = props
  const [montant, setMontant] = useState('')
  const [compteId, setCompteId] = useState(donnees.comptes[0]?.id ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  async function verser(e: FormEvent) {
    e.preventDefault()
    const valeur = lireMontant(montant)
    if (Number.isNaN(valeur) || valeur <= 0) {
      setErreur('Entrez un montant supérieur à zéro.')
      return
    }
    await creer('transactions', profil.id, {
      type: 'epargne',
      montant: valeur,
      date_operation: aujourdhui(),
      compte_id: compteId,
      compte_destination_id: null,
      categorie_id: null,
      source_revenu_id: null,
      projet_id: null,
      ligne_budget_id: null,
      objectif_id: objectif.id,
      regle_recurrente_id: null,
      note: null,
    })
    const cible = Number(objectif.montant_cible)
    if (dejaEpargne < cible && dejaEpargne + valeur >= cible) {
      void annoncer({
        titre: `Objectif atteint : ${objectif.nom}`,
        corps: `Vous avez mis de côté ${formaterMontant(cible, profil.devise)}. Bravo.`,
        niveau: 'normal',
      })
    }
    void synchroniser()
    fermer()
  }

  return (
    <form className="formulaire ajout-ligne" onSubmit={verser}>
      <div className="deux">
        <label>
          Montant
          <input
            inputMode="decimal"
            value={montant}
            onChange={(e) => {
              setMontant(e.target.value)
              setErreur(null)
            }}
            required
            autoFocus
            placeholder="10000"
          />
        </label>
        <label>
          Depuis le compte
          <select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
            {donnees.comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erreur && <p className="message erreur">{erreur}</p>}
      <div className="deux">
        <button className="bouton" type="button" onClick={fermer}>
          Annuler
        </button>
        <button className="bouton principal" type="submit">
          Verser
        </button>
      </div>
    </form>
  )
}

function FormulaireObjectif({ profil }: { profil: Utilisateur }) {
  const [nom, setNom] = useState('')
  const [cible, setCible] = useState('')
  const [date, setDate] = useState('')
  const [icone, setIcone] = useState(ICONES[0])
  const [erreur, setErreur] = useState<string | null>(null)

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    const montant = lireMontant(cible)
    if (Number.isNaN(montant) || montant <= 0) {
      setErreur('Entrez un montant supérieur à zéro.')
      return
    }
    if (date && date <= aujourdhui()) {
      setErreur('Choisissez une date dans le futur, ou laissez-la vide.')
      return
    }
    await creer('objectifs_epargne', profil.id, {
      nom: nom.trim(),
      montant_cible: montant,
      date_cible: date || null,
      icone,
      statut: 'en_cours',
    })
    setNom('')
    setCible('')
    setDate('')
    setErreur(null)
    void synchroniser()
  }

  return (
    <form className="formulaire" onSubmit={ajouter}>
      <label>
        Nom de l'objectif
        <input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Moto" />
      </label>
      <div className="deux">
        <label>
          Montant à atteindre
          <input
            inputMode="decimal"
            value={cible}
            onChange={(e) => {
              setCible(e.target.value)
              setErreur(null)
            }}
            required
            placeholder="600000"
          />
        </label>
        <label>
          Pour quelle date (facultatif)
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setErreur(null)
            }}
          />
        </label>
      </div>
      <fieldset className="choix">
        <legend>Icône</legend>
        {ICONES.map((i) => (
          <button
            key={i}
            type="button"
            className={icone === i ? 'puce choisie' : 'puce'}
            onClick={() => setIcone(i)}
            aria-label={`Icône ${i}`}
            aria-pressed={icone === i}
          >
            {i}
          </button>
        ))}
      </fieldset>
      {erreur && <p className="message erreur">{erreur}</p>}
      <button className="bouton principal" type="submit">
        Créer l'objectif
      </button>
    </form>
  )
}
