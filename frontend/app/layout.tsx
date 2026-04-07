import type { Metadata } from "next";
import { Providers } from "@/components/layout/Providers";
import "./globals.css";
import "@/styles/linear-theme.css";

export const metadata: Metadata = {
  title: "Aegis — Agentic Product OS",
  description: "Continuous pre-mortem for startup bets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
