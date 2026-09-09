import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";

import "./globals.css";

// Self-hosted at build time by `next/font`, so the page makes no request to
// Google at runtime and the pixel type never arrives late enough to reflow.
const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SNAKE",
  description: "Server-authoritative snake: Python owns the state, the browser only draws it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}
