import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Snake",
  description: "Server-authoritative snake: Python owns the state, TypeScript draws it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
