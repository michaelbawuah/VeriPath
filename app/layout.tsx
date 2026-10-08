import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeriPath · NYC route explorer",
  description: "Compare NYC routes with historical collision context and clear evidence. A US-first foundation for city-by-city expansion.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
