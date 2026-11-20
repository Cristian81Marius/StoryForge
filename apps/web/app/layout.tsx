import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "StoryForge", description: "Producția săptămânală de episoade animate" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
