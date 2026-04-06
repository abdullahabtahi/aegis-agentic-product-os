import type { Metadata } from "next";
import { Providers } from "@/components/layout/Providers";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-[#0A0A0F] text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
