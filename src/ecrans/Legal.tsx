import type { ReactNode } from 'react'
import { EDITEUR, type PageLegale } from '../lib/editeur'

function Contact() {
  return EDITEUR.emailContact ? (
    <p>
      Pour toute question, écrivez à <a href={`mailto:${EDITEUR.emailContact}`}>{EDITEUR.emailContact}</a>.
    </p>
  ) : (
    <p>Pour toute question, contactez {EDITEUR.nom}.</p>
  )
}

function Conditions() {
  return (
    <>
      <h1>Conditions d'utilisation</h1>
      <p className="discret">Dernière mise à jour : {EDITEUR.derniereMiseAJour}</p>

      <h2>1. Le service</h2>
      <p>
        Finances est une application éditée par {EDITEUR.nom} ({EDITEUR.pays}). Elle vous permet de suivre vos
        revenus, vos dépenses, votre épargne et les budgets de vos projets. En créant un compte, vous acceptez
        les présentes conditions.
      </p>

      <h2>2. Votre compte</h2>
      <p>
        Vous créez un compte avec une adresse email et un mot de passe. Vous devez fournir des informations
        exactes et garder votre mot de passe secret. Un compte est personnel : il est prévu pour une seule
        personne. Prévenez-nous si vous pensez que quelqu'un d'autre y a eu accès.
      </p>

      <h2>3. Vos données</h2>
      <p>
        Les informations que vous saisissez vous appartiennent. Nous les utilisons uniquement pour faire
        fonctionner le service, comme décrit dans la <a href="#confidentialite">politique de confidentialité</a>.
      </p>

      <h2>4. Utilisation autorisée</h2>
      <p>Vous vous engagez à ne pas :</p>
      <ul>
        <li>tenter d'accéder aux données d'un autre utilisateur ;</li>
        <li>perturber le fonctionnement du service ou contourner ses protections ;</li>
        <li>utiliser le service pour une activité illégale.</li>
      </ul>

      <h2>5. Pas de conseil financier</h2>
      <p>
        Finances est un outil de suivi. Les chiffres, graphiques et alertes affichés dépendent de ce que vous
        saisissez et ne constituent pas un conseil financier, comptable ou fiscal. Vous restez seul responsable
        de vos décisions.
      </p>

      <h2>6. Disponibilité</h2>
      <p>
        Le service est fourni en l'état. Nous faisons de notre mieux pour qu'il reste disponible, mais nous ne
        garantissons pas un fonctionnement sans interruption ni sans erreur. Les données saisies hors ligne
        restent sur votre appareil jusqu'à leur synchronisation : si vous effacez les données du navigateur ou
        vous déconnectez avant, elles peuvent être perdues.
      </p>

      <h2>7. Responsabilité</h2>
      <p>
        Dans les limites permises par la loi, {EDITEUR.nom} ne peut être tenu responsable des pertes liées à
        l'utilisation du service, à une erreur de saisie ou à une indisponibilité.
      </p>

      <h2>8. Fin du compte</h2>
      <p>
        Vous pouvez arrêter d'utiliser le service à tout moment et demander la suppression de votre compte et
        de vos données. Nous pouvons suspendre un compte qui ne respecte pas ces conditions.
      </p>

      <h2>9. Évolution des conditions</h2>
      <p>
        Ces conditions peuvent évoluer. En cas de changement important, nous vous en informerons dans
        l'application avant son entrée en vigueur.
      </p>

      <h2>10. Droit applicable</h2>
      <p>Ces conditions sont soumises au droit de la République du Mali.</p>

      <Contact />
    </>
  )
}

function Confidentialite() {
  return (
    <>
      <h1>Confidentialité et cookies</h1>
      <p className="discret">Dernière mise à jour : {EDITEUR.derniereMiseAJour}</p>

      <h2>1. Qui est responsable</h2>
      <p>
        {EDITEUR.nom} ({EDITEUR.pays}) est responsable du traitement des données de l'application Finances.
      </p>

      <h2>2. Les données que nous traitons</h2>
      <ul>
        <li>
          <strong>Votre compte :</strong> nom, adresse email, numéro de téléphone si vous le donnez, devise et
          langue choisies.
        </li>
        <li>
          <strong>Vos données financières :</strong> comptes, sources de revenu, revenus, dépenses, catégories
          et notes que vous saisissez.
        </li>
        <li>
          <strong>Données techniques :</strong> les informations nécessaires pour vous garder connecté et, si
          vous activez les notifications, l'identifiant de votre appareil pour les recevoir.
        </li>
      </ul>
      <p>Nous ne lisons pas vos SMS et nous n'accédons pas à vos comptes bancaires ou de mobile money.</p>

      <h2>3. Pourquoi nous les utilisons</h2>
      <ul>
        <li>créer et sécuriser votre compte ;</li>
        <li>afficher vos soldes, vos graphiques et vos alertes ;</li>
        <li>synchroniser vos données entre vos appareils ;</li>
        <li>vous envoyer les notifications que vous avez activées ;</li>
        <li>commenter vos chiffres avec le conseiller, si vous l'utilisez.</li>
      </ul>
      <p>Nous ne vendons pas vos données et nous ne les utilisons pas pour de la publicité.</p>

      <h2>4. Où elles sont conservées</h2>
      <ul>
        <li>
          <strong>Sur votre appareil :</strong> une copie de vos données est gardée dans le navigateur pour que
          l'application fonctionne sans connexion.
        </li>
        <li>
          <strong>Sur nos serveurs :</strong> vos données sont hébergées par Supabase, sur des serveurs situés
          en Allemagne (Union européenne). L'application elle-même est distribuée par Vercel.
        </li>
      </ul>
      <p>Vos données sont donc transférées et conservées en dehors du Mali.</p>

      <h2>4 bis. Le conseiller (intelligence artificielle)</h2>
      <p>
        Le conseiller est facultatif et ne s'active qu'avec votre accord. Une fois activé, il prépare de
        lui-même un bilan environ une fois par jour, et répond à vos questions. À chaque fois, l'application
        envoie au serveur {EDITEUR.nom}, qui les transmet à un fournisseur d'intelligence
        artificielle : vos totaux de revenus et de dépenses par mois et par catégorie, votre solde
        disponible, le nom, le montant et l'avancement de vos objectifs et de vos projets, ainsi que vos 40
        derniers mouvements avec leur date, leur montant, leur catégorie et leur note.
      </p>
      <p>
        Votre nom, votre email et votre téléphone ne sont jamais transmis. En revanche, si vos notes
        contiennent des noms ou des détails personnels, ils sont transmis avec elles : évitez d'y écrire ce
        que vous ne souhaitez pas partager. Les
        fournisseurs d'intelligence artificielle sont situés hors du Mali. Les réponses sont générées
        automatiquement et peuvent contenir des erreurs.
      </p>

      <h2>5. Sécurité</h2>
      <ul>
        <li>les échanges entre votre appareil et nos serveurs sont chiffrés (HTTPS) ;</li>
        <li>la base de données est chiffrée sur les disques de l'hébergeur ;</li>
        <li>chaque compte n'a accès qu'à ses propres données ;</li>
        <li>votre mot de passe n'est jamais conservé en clair.</li>
      </ul>
      <p>Aucun système n'est infaillible : choisissez un mot de passe solide et ne le partagez pas.</p>

      <h2>6. Durée de conservation</h2>
      <p>
        Vos données sont conservées tant que votre compte existe. Si vous demandez sa suppression, elles sont
        effacées de nos serveurs dans un délai de 30 jours.
      </p>

      <h2>7. Vos droits</h2>
      <p>
        Conformément à la loi malienne n° 2013-015 du 21 mai 2013 sur la protection des données à caractère
        personnel, vous pouvez demander à consulter vos données, à les corriger, à les supprimer ou vous opposer
        à leur traitement. Vous pouvez aussi saisir l'Autorité de protection des données à caractère personnel
        (APDP).
      </p>

      <h2>8. Cookies et stockage sur votre appareil</h2>
      <p>
        Finances n'utilise aucun cookie publicitaire ni outil de mesure d'audience. L'application enregistre
        uniquement, dans votre navigateur, ce qui est indispensable à son fonctionnement :
      </p>
      <ul>
        <li>
          <strong>Votre session :</strong> pour rester connecté sans retaper votre mot de passe.
        </li>
        <li>
          <strong>Vos données hors ligne :</strong> la copie locale de vos comptes et mouvements, et la liste
          des modifications en attente d'envoi.
        </li>
        <li>
          <strong>Les fichiers de l'application :</strong> pour qu'elle s'ouvre sans connexion.
        </li>
      </ul>
      <p>
        Comme ces éléments sont strictement nécessaires, ils ne demandent pas votre accord préalable. Vous
        pouvez les effacer depuis les réglages de votre navigateur ou en vous déconnectant ; les modifications
        non synchronisées seront alors perdues.
      </p>

      <h2>9. Évolution de cette politique</h2>
      <p>
        Cette politique peut évoluer, par exemple si de nouvelles fonctions sont ajoutées. La date en haut de
        page indique la dernière version.
      </p>

      <Contact />
    </>
  )
}

const PAGES: Record<PageLegale, () => ReactNode> = {
  conditions: Conditions,
  confidentialite: Confidentialite,
}

export default function Legal({ page, fermer }: { page: PageLegale; fermer: () => void }) {
  const Page = PAGES[page]
  return (
    <div className="legal" role="dialog" aria-modal="true">
      <div className="legal-contenu">
        <button className="lien retour" onClick={fermer}>
          ← Retour
        </button>
        <article>
          <Page />
        </article>
        <nav className="legal-liens" aria-label="Pages légales">
          <a href="#conditions">Conditions d'utilisation</a>
          <a href="#confidentialite">Confidentialité et cookies</a>
        </nav>
      </div>
    </div>
  )
}
