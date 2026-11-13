import { formaterDate, formaterMontant } from '../lib/format'
import type { Donnees } from '../lib/hooks'
import type { Transaction } from '../types'

export default function LigneTransaction(props: {
  transaction: Transaction
  donnees: Donnees
  devise: string
  onSupprimer?: () => void
}) {
  const { transaction: t, donnees, devise, onSupprimer } = props
  const compte = donnees.comptes.find((c) => c.id === t.compte_id)
  const categorie = donnees.categories.find((c) => c.id === t.categorie_id)
  const source = donnees.sources.find((s) => s.id === t.source_revenu_id)

  const objectif = donnees.objectifs.find((o) => o.id === t.objectif_id)

  const estRevenu = t.type === 'revenu'
  const estEpargne = t.type === 'epargne'
  const titre = estRevenu
    ? source?.nom ?? 'Revenu'
    : estEpargne
      ? `Épargne : ${objectif?.nom ?? 'objectif supprimé'}`
      : categorie?.nom ?? 'Dépense'
  const icone = estRevenu ? '💰' : estEpargne ? objectif?.icone ?? '🎯' : categorie?.icone ?? '📦'

  return (
    <li className="mouvement">
      <span className="icone" aria-hidden="true">
        {icone}
      </span>
      <div className="texte">
        <strong>{t.note || titre}</strong>
        <small>
          {t.note ? `${titre} · ` : ''}
          {compte?.nom ?? 'Compte supprimé'} · {formaterDate(t.date_operation)}
        </small>
      </div>
      <span className={estRevenu ? 'montant positif' : 'montant negatif'}>
        {estRevenu ? '+' : '−'}
        {formaterMontant(Number(t.montant), devise)}
      </span>
      {onSupprimer && (
        <button className="icone-bouton" onClick={onSupprimer} aria-label={`Supprimer ${t.note || titre}`}>
          ✕
        </button>
      )}
    </li>
  )
}
