import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | PynkPours Admin" },
  robots: { index: false, follow: false },
};

/** Admin pages read the session cookie, so they render per request inside this boundary. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#f6f2ef]" aria-busy="true"><p className="sr-only" role="status">Loading…</p></div>}>
      {children}
    </Suspense>
  );
}
