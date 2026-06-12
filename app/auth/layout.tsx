import Image from "next/image";
import Link from "next/link";
import { Sparkles, Quote } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Visual side */}
      <div className="relative hidden overflow-hidden lg:block">
        <Image
          src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80"
          alt="Chauffeur privé premium"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-br from-ink-950/80 via-ink-950/50 to-royal-900/40" />
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">
              Lume<span className="text-royal-400">Car</span>
            </span>
          </Link>

          <div className="max-w-md">
            <Quote className="h-8 w-8 text-royal-400/60" />
            <p className="mt-4 text-2xl font-medium leading-snug text-white">
              « LumeCar a transformé mes déplacements professionnels. Un niveau
              de service que je ne pensais pas possible. »
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Image
                src="https://i.pravatar.cc/100?img=64"
                alt="Michael S."
                width={44}
                height={44}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-white/20"
              />
              <div>
                <p className="text-sm font-semibold text-white">Michael S.</p>
                <p className="text-xs text-white/50">Directeur, New York</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
