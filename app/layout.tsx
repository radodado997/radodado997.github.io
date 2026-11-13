import type { Metadata } from "next";
import "./globals.css";
import FestiveBackground from "@/components/festive/FestiveBackground";
import MusicToggle from "@/components/festive/MusicToggle";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "🎄 Secret Santa · Świąteczny Przepych",
  description: "Losowanie osób na prezenty świąteczne, z najlepszą oprawą.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <FestiveBackground />
        <div className="container">
          <AuthGate>{children}</AuthGate>
        </div>
        <MusicToggle />
      </body>
    </html>
  );
}
