import type { Metadata } from "next";
import { Public_Sans, Literata } from "next/font/google";
import "./globals.css";

const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Literata({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Smart Reader",
  description: "Paste an article, get a short summary, and listen to it.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );
}
