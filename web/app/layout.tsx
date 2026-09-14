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
  title: "YLX | Snake Game",
  description: "A 90’S RETRO TAKE ON THE CLASSIC SNAKE GAME.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (

    <html lang="en" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}
