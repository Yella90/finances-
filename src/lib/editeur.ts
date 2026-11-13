// Informations sur l'éditeur, reprises dans les pages légales.
export const EDITEUR = {
  nom: 'UNITECH',
  pays: 'Mali',
  // Adresse à laquelle les utilisateurs peuvent écrire pour leurs données.
  // C'est celle publiée sur la page Contact du site UNITECH.
  // Si elle est vide, les pages légales n'affichent pas d'adresse.
  emailContact: 'doumbialayesoma@gmail.com',
  derniereMiseAJour: '13 novembre 2026',
}

export type PageLegale = 'conditions' | 'confidentialite'

export function lirePageLegale(hash: string): PageLegale | null {
  const cle = hash.replace(/^#/, '')
  return cle === 'conditions' || cle === 'confidentialite' ? cle : null
}
