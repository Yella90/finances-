import { useMemo, useState, type FormEvent } from 'react'
import { depensesDesProjets, niveauBudget, type NiveauBudget } from '../lib/calculs'
import { creer, modifier, supprimer } from '../lib/db'
import { formaterMontant } from '../lib/format'
import type { Donnees } from '../lib/hooks'
import { synchroniser } from '../lib/sync'
import type { Projet, StatutProjet, Utilisateur } from '../types'
import LigneTransaction from './LigneTransaction'

const STATUTS: Record<StatutProjet, string> = {
  en_cours: 'En cours',
  suspendu: 'Suspendu',
  termine: 'Terminé',
}

const ETIQUETTES: Record<NiveauBudget, string | null> = {
  normal: null,
  attention: 'Bientôt atteint',
  depasse: 'Dépassé',
}

function lireMontant(texte: string): number {
  const n = Number(texte.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

function Jauge({ depense, prevu, haute }: { depense: number; prevu: number; haute?: boolean }) {
  const part = prevu > 0 ? Math.min(100, (depense / prevu) * 100) : depense > 0 ? 100 : 0
  return (
    <div className={haute ? 'jauge haute' : 'jauge'}>
      <span className={niveauBudget(depense, prevu)} style={{ width: `${part}%` }} />
    </div>
  )
}

function Etiquette({ depense, prevu }: { depense: number; prevu: number }) {
  const niveau = niveauBudget(depense, prevu)
  const texte = ETIQUETTES[niveau]
  return texte ? <span className={`etiquette ${niveau}`}>{texte}</span> : null
}

export default function Projets(props: { profil: Utilisateur; donnees: Donnees }) {
  const { profil, donnees } = props
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const depenses = useMemo(() => depensesDesProjets(donnees.transactions), [donnees.transactions])
  const argent = (m: number) => formaterMontant(m, profil.devise)

  const ouvert = donnees.projets.find((p) => p.id === ouvertId)
  if (ouvert) {
    return (
      <DetailProjet
        projet={ouvert}
        profil={profil}
        donnees={donnees}
        depense={depenses.parProjet.get(ouvert.id) ?? 0}
        parLigne={depenses.parLigne}
        retour={() => setOuvertId(null)}
      />
    )
  }

  return (
    <>
      {donnees.pret && donnees.projets.length === 0 && (
        <section className="carte vide">
          <h2>Suivez le budget de vos projets</h2>
          <p>
            Construction, commerce, événement : fixez un budget, découpez-le en postes, puis rattachez vos
            dépenses au projet.
          </p>
        </section>
      )}

      {donnees.projets.map((p) => {
        const depense = depenses.parProjet.get(p.id) ?? 0
        const budget = Number(p.budget_total)
        return (
          <button key={p.id} className="projet-carte" onClick={() => setOuvertId(p.id)}>
            <div className="ligne">
              <strong>{p.nom}</strong>
              {p.statut === 'en_cours' ? (
                <Etiquette depense={depense} prevu={budget} />
              ) : (
                <span className="etiquette">{STATUTS[p.statut]}</span>
              )}
            </div>
            <Jauge depense={depense} prevu={budget} haute />
            <div className="ligne discret">
              <span>
                {argent(depense)} sur {argent(budget)}
              </span>
              <span>{budget - depense >= 0 ? `Reste ${argent(budget - depense)}` : `Dépassé de ${argent(depense - budget)}`}</span>
            </div>
          </button>
        )
      })}

      <section className="carte">
        <h2>Nouveau projet</h2>
        <FormulaireProjet profil={profil} />
      </section>
    </>
  )
}

function FormulaireProjet({ profil }: { profil: Utilisateur }) {
  const [nom, setNom] = useState('')
  const [budget, setBudget] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    const total = lireMontant(budget)
    if (Number.isNaN(total) || total <= 0) {
      setErreur('Entrez un budget supérieur à zéro.')
      return
    }
    await creer('projets', profil.id, {
      nom: nom.trim(),
      description: null,
      budget_total: total,
      date_debut: null,
      date_fin: null,
      statut: 'en_cours',
    })
    setNom('')
    setBudget('')
    setErreur(null)
    void synchroniser()
  }

  return (
    <form className="formulaire" onSubmit={ajouter}>
      <label>
        Nom du projet
        <input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Construction maison" />
      </label>
      <label>
        Budget total
        <input
          inputMode="decimal"
          value={budget}
          onChange={(e) => {
            setBudget(e.target.value)
            setErreur(null)
          }}
          required
          placeholder="2000000"
        />
      </label>
      {erreur && <p className="message erreur">{erreur}</p>}
      <button className="bouton principal" type="submit">
        Créer le projet
      </button>
    </form>
  )
}

function DetailProjet(props: {
  projet: Projet
  profil: Utilisateur
  donnees: Donnees
  depense: number
  parLigne: Map<string, number>
  retour: () => void
}) {
  const { projet, profil, donnees, depense, parLigne, retour } = props
  const argent = (m: number) => formaterMontant(m, profil.devise)

  const budget = Number(projet.budget_total)
  const lignes = donnees.lignesBudget.filter((l) => l.projet_id === projet.id)
  const totalPostes = lignes.reduce((s, l) => s + Number(l.montant_prevu), 0)
  const depenseSurPostes = lignes.reduce((s, l) => s + (parLigne.get(l.id) ?? 0), 0)
  const horsPostes = depense - depenseSurPostes
  const mouvements = donnees.transactions.filter((t) => t.projet_id === projet.id)
  const reste = budget - depense

  async function changerStatut(statut: StatutProjet) {
    await modifier('projets', projet.id, { statut })
    void synchroniser()
  }

  async function retirerPoste(id: string, nom: string) {
    if (!window.confirm(`Supprimer le poste « ${nom} » ? Ses dépenses restent rattachées au projet.`)) return
    await supprimer('lignes_budget', id)
    void synchroniser()
  }

  async function retirerProjet() {
    const message =
      mouvements.length > 0
        ? `Supprimer le projet « ${projet.nom} » ? Ses ${mouvements.length} dépense(s) seront conservées, mais sans projet.`
        : `Supprimer le projet « ${projet.nom} » ?`
    if (!window.confirm(message)) return
    for (const l of lignes) await supprimer('lignes_budget', l.id)
    for (const t of mouvements) await modifier('transactions', t.id, { projet_id: null, ligne_budget_id: null })
    await supprimer('projets', projet.id)
    void synchroniser()
    retour()
  }

  return (
    <>
      <header className="entete">
        <button className="lien retour" onClick={retour}>
          ← Projets
        </button>
        <select
          className="statut"
          value={projet.statut}
          onChange={(e) => changerStatut(e.target.value as StatutProjet)}
          aria-label="Statut du projet"
        >
          {Object.entries(STATUTS).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </header>

      <section className="carte">
        <div className="ligne">
          <h1 className="titre-projet">{projet.nom}</h1>
          <Etiquette depense={depense} prevu={budget} />
        </div>
        <Jauge depense={depense} prevu={budget} haute />
        <div className="resume-budget">
          <div>
            <p>Budget</p>
            <strong>{argent(budget)}</strong>
          </div>
          <div>
            <p>Dépensé</p>
            <strong>{argent(depense)}</strong>
          </div>
          <div>
            <p>{reste >= 0 ? 'Reste' : 'Dépassement'}</p>
            <strong className={reste >= 0 ? 'positif' : 'negatif'}>{argent(Math.abs(reste))}</strong>
          </div>
        </div>
        {totalPostes > budget && (
          <p className="message attention">
            Vos postes totalisent {argent(totalPostes)}, soit {argent(totalPostes - budget)} de plus que le budget.
          </p>
        )}
      </section>

      <section className="carte">
        <h2>Postes du budget</h2>
        {lignes.length === 0 && (
          <p className="discret">Découpez le budget en postes : ciment, main-d'œuvre, transport…</p>
        )}
        {lignes.map((l) => {
          const d = parLigne.get(l.id) ?? 0
          const prevu = Number(l.montant_prevu)
          return (
            <div className="poste" key={l.id}>
              <div className="ligne">
                <strong>{l.nom}</strong>
                <Etiquette depense={d} prevu={prevu} />
                <button className="icone-bouton" onClick={() => retirerPoste(l.id, l.nom)} aria-label={`Supprimer ${l.nom}`}>
                  ✕
                </button>
              </div>
              <Jauge depense={d} prevu={prevu} />
              <p className="discret">
                {argent(d)} sur {argent(prevu)}
              </p>
            </div>
          )
        })}
        {horsPostes > 0 && lignes.length > 0 && (
          <p className="discret">Dépenses sans poste précis : {argent(horsPostes)}</p>
        )}
        <FormulairePoste profil={profil} projetId={projet.id} />
      </section>

      <section className="carte">
        <h2>Dépenses du projet</h2>
        {mouvements.length === 0 ? (
          <p className="discret">
            Aucune dépense pour l'instant. Appuyez sur +, saisissez une dépense et choisissez ce projet.
          </p>
        ) : (
          <ul className="liste">
            {mouvements.map((t) => (
              <LigneTransaction key={t.id} transaction={t} donnees={donnees} devise={profil.devise} />
            ))}
          </ul>
        )}
      </section>

      <button className="bouton" onClick={retirerProjet}>
        Supprimer le projet
      </button>
    </>
  )
}

function FormulairePoste({ profil, projetId }: { profil: Utilisateur; projetId: string }) {
  const [nom, setNom] = useState('')
  const [montant, setMontant] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    const prevu = lireMontant(montant)
    if (Number.isNaN(prevu) || prevu <= 0) {
      setErreur('Entrez un montant supérieur à zéro.')
      return
    }
    await creer('lignes_budget', profil.id, { projet_id: projetId, nom: nom.trim(), montant_prevu: prevu })
    setNom('')
    setMontant('')
    setErreur(null)
    void synchroniser()
  }

  return (
    <form className="formulaire ajout-ligne" onSubmit={ajouter}>
      <div className="deux">
        <label>
          Nom du poste
          <input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ciment" />
        </label>
        <label>
          Montant prévu
          <input
            inputMode="decimal"
            value={montant}
            onChange={(e) => {
              setMontant(e.target.value)
              setErreur(null)
            }}
            required
            placeholder="500000"
          />
        </label>
      </div>
      {erreur && <p className="message erreur">{erreur}</p>}
      <button className="bouton" type="submit">
        Ajouter le poste
      </button>
    </form>
  )
}
