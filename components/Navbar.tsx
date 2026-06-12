"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  MessageSquare,
  Sparkles,
  LayoutDashboard,
  LogOut,
  CarFront,
  User,
  ChevronDown,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/drivers", label: "Chauffeurs" },
  { href: "/#villes", label: "Villes" },
  { href: "/messages", label: "Messagerie" },
  { href: "/live", label: "Salon live" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Close the account dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setMenuOpen(false);
    setOpen(false);
    router.push("/");
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-safe">
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between transition-all duration-500",
          scrolled
            ? "mx-3 mt-3 rounded-2xl glass-strong px-4 py-2.5 shadow-card lg:mx-auto lg:px-6"
            : "px-5 py-4 lg:px-8"
        )}
      >
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Lume<span className="text-royal-400">Car</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/messages"
            className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white"
            aria-label="Messagerie"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-royal-500 text-[10px] font-semibold text-white">
              2
            </span>
          </Link>

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((m) => !m)}
                className="flex items-center gap-2 rounded-full border border-white/10 py-1.5 pl-1.5 pr-3 transition hover:bg-white/5"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-royal-400 to-royal-600 text-xs font-semibold text-white">
                  {initials(user.firstName, user.lastName)}
                </span>
                <span className="text-sm font-medium text-white">
                  {user.firstName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-white/50" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl glass-strong p-2 shadow-card"
                  >
                    <div className="border-b border-white/10 px-3 py-2.5">
                      <p className="text-sm font-semibold text-white">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-white/50">
                        {user.role === "driver" ? (
                          <CarFront className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {user.role === "driver" ? "Chauffeur" : "Client"}
                      </p>
                    </div>
                    <Link
                      href="/compte"
                      className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/5"
                    >
                      <LayoutDashboard className="h-4 w-4" /> Mon espace
                    </Link>
                    <Link
                      href="/messages"
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/5"
                    >
                      <MessageSquare className="h-4 w-4" /> Messagerie
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="mt-1 flex w-full items-center gap-2.5 rounded-xl border-t border-white/10 px-3 py-2.5 text-sm text-red-300 transition hover:bg-red-400/10"
                    >
                      <LogOut className="h-4 w-4" /> Déconnexion
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <Link href="/auth/login" className="btn-ghost text-sm">
                Connexion
              </Link>
              <Link href="/auth/register" className="btn-primary text-sm">
                S'inscrire
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white md:hidden"
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-3 mt-2 overflow-hidden rounded-2xl glass-strong p-4 md:hidden"
          >
            {user && (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-royal-400 to-royal-600 text-sm font-semibold text-white">
                  {initials(user.firstName, user.lastName)}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-white/50">
                    {user.role === "driver" ? "Chauffeur" : "Client"}
                  </p>
                </div>
              </div>
            )}
            <nav className="flex flex-col gap-1">
              {user && (
                <Link
                  href="/compte"
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5"
                >
                  <LayoutDashboard className="h-4 w-4" /> Mon espace
                </Link>
              )}
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            {user ? (
              <button
                onClick={handleSignOut}
                className="btn-ghost mt-3 w-full border-red-400/30 text-sm text-red-300"
              >
                <LogOut className="h-4 w-4" /> Déconnexion
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/auth/login" className="btn-ghost text-sm">
                  Connexion
                </Link>
                <Link href="/auth/register" className="btn-primary text-sm">
                  S'inscrire
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
