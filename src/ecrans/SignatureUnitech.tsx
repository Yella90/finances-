/** Mention de l'éditeur, affichée en bas de l'écran de connexion et des réglages. */
export default function SignatureUnitech() {
  return (
    <footer className="pied">
      <p className="signature">
        <img src="/unitech.svg" alt="" width="28" height="28" />
        <span>
          Un produit <strong>UNITECH</strong>
        </span>
      </p>
      <nav className="legal-liens" aria-label="Pages légales">
        <a href="#conditions">Conditions d'utilisation</a>
        <a href="#confidentialite">Confidentialité et cookies</a>
      </nav>
    </footer>
  )
}
