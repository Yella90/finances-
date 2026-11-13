const SANS_DECIMALES = new Set(['XOF', 'XAF', 'GNF', 'JPY'])

export function formaterMontant(montant: number, devise: string): string {
  const decimales = SANS_DECIMALES.has(devise) ? 0 : 2
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: devise,
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(montant)
  } catch {
    return `${montant.toFixed(decimales)} ${devise}`
  }
}

/** Date du jour au format AAAA-MM-JJ, dans le fuseau de l'appareil. */
export function aujourdhui(): string {
  const d = new Date()
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jour = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mois}-${jour}`
}

export function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(a, m - 1, j),
  )
}

export function nomMois(cleMois: string, court = false): string {
  const [a, m] = cleMois.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', court ? { month: 'short' } : { month: 'long', year: 'numeric' }).format(
    new Date(a, m - 1, 1),
  )
}

/** Les n derniers mois, du plus ancien au plus récent, au format AAAA-MM. */
export function derniersMois(n: number): string[] {
  const d = new Date()
  const mois: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    mois.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return mois
}

export const DEVISES: { code: string; nom: string }[] = [
  { code: 'XOF', nom: 'Franc CFA (XOF)' },
  { code: 'EUR', nom: 'Euro (EUR)' },
  { code: 'USD', nom: 'Dollar américain (USD)' },
  { code: 'GNF', nom: 'Franc guinéen (GNF)' },
  { code: 'XAF', nom: 'Franc CFA d\'Afrique centrale (XAF)' },
  { code: 'MAD', nom: 'Dirham marocain (MAD)' },
]
