import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const editorial = Fraunces({ subsets: ["latin"], variable: "--font-editorial", weight: ["400", "500", "600", "700"], style: ["normal", "italic"], display: "swap" });
const ui = Manrope({ subsets: ["latin"], variable: "--font-ui", weight: ["400", "500", "600", "700", "800"], display: "swap" });
const code = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-code", weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: "Rewind — Your personal music time machine",
  description: "Drag through the decades. Rediscover an album, play the full song, and revisit your own listening memories. Good music, any time.",
  referrer: "strict-origin-when-cross-origin",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${editorial.variable} ${ui.variable} ${code.variable}`}><body>{children}</body></html>;
}
