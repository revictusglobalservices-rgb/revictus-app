import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revictus",
  description: "Gestion des collaborateurs, tâches et temps — suivi opérationnel en temps réel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
