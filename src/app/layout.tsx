import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "HaBayit Jewish Center – Cooper City, FL",
  description:
    "A warm Jewish home with an Israeli spirit. Hebrew School, Bar & Bat Mitzvah programs, Shabbat services, and a community where everyone belongs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${inter.variable} ${frankRuhl.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">{children}</body>
    </html>
  );
}
