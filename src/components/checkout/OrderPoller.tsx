"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** While payment is being confirmed by Stripe's webhook, refresh the page every few seconds. */
export function OrderPoller({ maxSeconds = 240 }: { maxSeconds?: number }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (elapsed >= maxSeconds) return;
    const t = setTimeout(() => {
      setElapsed((e) => e + 3);
      router.refresh();
    }, 3000);
    return () => clearTimeout(t);
  }, [elapsed, maxSeconds, router]);
  return (
    <p role="status" aria-live="polite" className="text-sm text-pp-cream/70">
      {elapsed < maxSeconds ? "This page updates automatically." : "This is taking longer than usual. You'll receive an email once it's confirmed — you can safely close this page."}
    </p>
  );
}
