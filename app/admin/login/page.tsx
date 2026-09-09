import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administration — Nova Compagnie",
  robots: { index: false, follow: false },
};

/**
 * Porte d'entrée du back-office. Hors du groupe (site) : pas de navbar, pas de
 * footer — une console interne n'est pas une page du site public.
 */
export default async function AdminLoginPage() {
  // Un admin déjà identifié n'a rien à faire sur un écran de connexion.
  const guard = await requireAdmin();
  if (guard.state === "ok") redirect("/admin");

  return (
    <div className="relative flex min-h-screen-dvh flex-col items-center justify-center px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-96 w-[600px] -translate-x-1/2 rounded-full bg-royal-500/10 blur-[120px]" />
      </div>

      <Link href="/" className="mb-10 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">
          Nova <span className="text-royal-400">Compagnie</span>
        </span>
      </Link>

      <Suspense fallback={null}>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
