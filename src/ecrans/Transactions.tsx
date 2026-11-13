import { useMemo, useState } from 'react'
import { supprimer } from '../lib/db'
import { nomMois } from '../lib/format'
import type { Donnees } from '../lib/hooks'
import { synchroniser } from '../lib/sync'
import type { Utilisateur } from '../types'
import LigneTransaction from './LigneTransaction'

type Filtre = 'tout' | 'revenu' | 'depense'

export default function Transactions(props: { profil: Utilisateur; donnees: Donnees }) {
  const { profil, donnees } = props
  const [filtre, setFiltre] = useState<Filtre>('tout')

  const parMois = useMemo(() => {
    const groupes = new Map<string, typeof donnees.transactions>()
    for (const t of donnees.transactions) {
      if (filtre !== 'tout' && t.type !== filtre) continue
      const cle = t.date_operation.slice(0, 7)
      groupes.set(cle, [...(groupes.get(cle) ?? []), t])
    }
    return [...groupes.entries()]
  }, [donnees.transactions, filtre])

  async function retirer(id: string) {
    if (!window.confirm('Supprimer ce mouvement ?')) return
    await supprimer('transactions', id)
    void synchroniser()
  }

  return (
    <>
      <header className="entete">
        <h1>Mouvements</h1>
      </header>

      <div className="filtres" role="group" aria-label="Filtrer les mouvements">
        {(['tout', 'depense', 'revenu'] as Filtre[]).map((f) => (
          <button key={f} className={filtre === f ? 'puce choisie' : 'puce'} onClick={() => setFiltre(f)}>
            {f === 'tout' ? 'Tout' : f === 'depense' ? 'Dépenses' : 'Revenus'}
          </button>
        ))}
      </div>

      {parMois.length === 0 ? (
        <section className="carte vide">
          <h2>Aucun mouvement</h2>
          <p>Appuyez sur + pour saisir une dépense ou un revenu.</p>
        </section>
      ) : (
        parMois.map(([mois, lignes]) => (
          <section className="carte" key={mois}>
            <h2>{nomMois(mois)}</h2>
            <ul className="liste">
              {lignes.map((t) => (
                <LigneTransaction
                  key={t.id}
                  transaction={t}
                  donnees={donnees}
                  devise={profil.devise}
                  onSupprimer={() => retirer(t.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
