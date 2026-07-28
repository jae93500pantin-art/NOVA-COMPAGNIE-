import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nova Compagnie — Chauffeurs privés d'exception",
  description:
    "La plateforme premium qui connecte voyageurs exigeants et chauffeurs privés vérifiés à Paris.",
  keywords: [
    "chauffeur privé",
    "VTC premium",
    "Uber Black",
    "transfert aéroport",
    "Nova Compagnie",
  ],
  applicationName: "Nova Compagnie",
  appleWebApp: {
    capable: true,
    title: "Nova Compagnie",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen-dvh antialiased">
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
