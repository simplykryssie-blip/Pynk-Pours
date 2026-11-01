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
  // Not indexable until the owner approves launch.
  robots: { index: false, follow: false },
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
