import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";
import { ConnectButton } from "./connect-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "https://hedgehub.app";
const TITLE = "HedgeHub — AI risk co-pilot for Polymarket";
const DESCRIPTION =
  "Lock in profit on winning Polymarket bets or cap losses on losing ones — in one click, at live prices. See exactly what each hedge locks in, hedge part or all, and get alerted when a position is ripe.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "HedgeHub",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          {/* Top nav */}
          <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/70">
            <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-6">
              <a href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                HedgeHub
                <span className="font-normal text-zinc-400">for Polymarket</span>
              </a>
              <ConnectButton />
            </div>
          </header>

          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="border-t border-black/[0.06] dark:border-white/[0.06]">
            <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-zinc-400 sm:flex-row">
              <span>Lock in your Polymarket profits, in one click.</span>
              <span className="font-mono text-xs">CLOB V2 · builder-attributed</span>
            </div>
          </footer>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
