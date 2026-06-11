import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "7DTD Gameserver-UI",
  description: "Verwaltung des 7 Days to Die Gameservers",
};

const navLink: React.CSSProperties = {
  color: "#fff",
  marginRight: "1rem",
  textDecoration: "none",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <nav style={{ background: "#1a1a2e", padding: "0.75rem 1.5rem", marginBottom: "1rem" }}>
          <a href="/" style={navLink}>Dashboard</a>
          <a href="/players" style={navLink}>Spieler</a>
          <a href="/logs" style={navLink}>Logs</a>
          <a href="/config" style={navLink}>Config</a>
          <a href="/backups" style={navLink}>Backups</a>
          <a href="/schedule" style={navLink}>Zeitplan</a>
          <a href="/mods" style={navLink}>Mods</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
