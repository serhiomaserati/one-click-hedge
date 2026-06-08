import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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

export const metadata: Metadata = {
  title: "One-Click Hedge — Polymarket",
  description:
    "Read your Polymarket portfolio, find the opposing side of every market, and hedge your risk in one click.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          {/* Top nav */}
          <header className="sticky top-0 z-20 border-b border-black/5 bg-zinc-50/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
            <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
              <a href="/" className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-base font-bold text-white">
                  ⇄
                </span>
                <span className="text-[15px] font-semibold tracking-tight">
                  One-Click Hedge
                </span>
              </a>
              <ConnectButton />
            </div>
          </header>

          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="border-t border-black/5 dark:border-white/10">
            <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-zinc-400 sm:flex-row">
              <span>One-Click Hedge — hedge any Polymarket position.</span>
              <span className="font-mono text-xs">Built on Polymarket CLOB V2</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
