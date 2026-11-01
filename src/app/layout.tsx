import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Proposed pairing pending owner confirmation of brand fonts.
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-pp-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-pp-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "PynkPours", template: "%s | PynkPours" },
  description: "SIP • CONNECT • CREATE — Where ideas meet opportunity.",
  // Link previews (iMessage, WhatsApp, Facebook, LinkedIn, X). The image itself is
  // src/app/opengraph-image.png / twitter-image.png (the official logo on black).
  openGraph: {
    type: "website",
    siteName: "PynkPours",
    title: "PynkPours",
    description: "SIP • CONNECT • CREATE — Where ideas meet opportunity.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PynkPours",
    description: "SIP • CONNECT • CREATE — Where ideas meet opportunity.",
  },
  // Search engines may index only the production site (SITE_INDEXABLE=true).
  // The preview and local builds stay hidden. Private pages opt out individually.
  robots: process.env.SITE_INDEXABLE === "true" ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
