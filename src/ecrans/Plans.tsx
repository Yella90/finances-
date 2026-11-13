import { useState } from 'react'
import type { Donnees } from '../lib/hooks'
import type { Utilisateur } from '../types'
import Objectifs from './Objectifs'
import Projets from './Projets'

type Vue = 'epargne' | 'projets'

/** Regroupe les deux façons de planifier son argent : épargner et budgéter un projet. */
export default function Plans(props: { profil: Utilisateur; donnees: Donnees }) {
  const [vue, setVue] = useState<Vue>('epargne')

  return (
    <>
      <header className="entete">
        <h1>Plans</h1>
      </header>

      <div className="bascule" role="group" aria-label="Type de plan">
        <button className={vue === 'epargne' ? 'choisie' : ''} onClick={() => setVue('epargne')}>
          Épargne
        </button>
        <button className={vue === 'projets' ? 'choisie' : ''} onClick={() => setVue('projets')}>
          Projets
        </button>
      </div>

      {vue === 'epargne' ? <Objectifs {...props} /> : <Projets {...props} />}
    </>
  )
}
