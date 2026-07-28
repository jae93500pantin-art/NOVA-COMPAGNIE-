import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {/* Subtle premium backdrop (no photo, no marketing copy) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-96 w-[600px] -translate-x-1/2 rounded-full bg-royal-500/15 blur-[120px]" />
        <div className="absolute inset-0 bg-grid-faint [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,#000_8%,transparent_70%)]" />
      </div>

      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">
          Nova <span className="text-royal-400">Compagnie</span>
        </span>
      </Link>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
