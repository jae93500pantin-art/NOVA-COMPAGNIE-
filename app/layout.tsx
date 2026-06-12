import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LumeCar — Chauffeurs privés d'exception",
  description:
    "La plateforme premium qui connecte voyageurs exigeants et chauffeurs privés vérifiés à Paris, Londres, Barcelone et New York.",
  keywords: [
    "chauffeur privé",
    "VTC premium",
    "Uber Black",
    "transfert aéroport",
    "LumeCar",
  ],
  applicationName: "LumeCar",
  appleWebApp: {
    capable: true,
    title: "LumeCar",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
