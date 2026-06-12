export const metadata = { title: "Politique cookies — LumeCar" };

export default function CookiesPage() {
  return (
    <>
      <h1>Politique relative aux cookies</h1>
      <p className="updated">Dernière mise à jour : 11 juin 2026</p>
      <p className="lead">
        Un cookie est un petit fichier déposé sur votre appareil. Nous limitons
        leur usage au strict nécessaire et ne déposons aucun cookie non essentiel
        sans votre consentement préalable.
      </p>

      <h2>1. Cookies strictement nécessaires</h2>
      <p>
        Indispensables au fonctionnement du service : maintien de la session,
        sécurité, mémorisation de vos préférences de consentement. Ils ne
        requièrent pas de consentement.
      </p>

      <h2>2. Cookies de mesure d’audience</h2>
      <p>
        Avec votre accord, ils nous permettent de comprendre l’usage de la
        plateforme de manière agrégée et d’améliorer l’expérience. Désactivés par
        défaut.
      </p>

      <h2>3. Cookies marketing</h2>
      <p>
        Avec votre accord, ils permettent de personnaliser les communications.
        Désactivés par défaut.
      </p>

      <h2>4. Gérer votre choix</h2>
      <p>
        Vous pouvez modifier ou retirer votre consentement à tout moment depuis
        votre <a href="/legal/mes-donnees">centre « Mes données »</a>. Le retrait
        n’affecte pas la licéité du traitement effectué avant celui-ci.
      </p>
    </>
  );
}
