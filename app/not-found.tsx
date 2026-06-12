import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-5 pt-32 text-center">
      <div>
        <p className="text-7xl font-semibold text-gradient-royal">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          Page introuvable
        </h1>
        <p className="mt-2 text-white/50">
          Le contenu que vous cherchez n'existe pas ou a été déplacé.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
