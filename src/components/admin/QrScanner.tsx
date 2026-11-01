"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { scanCheckIn, type ScanResult } from "@/server/admin/people";
import { smallButton } from "./ui";

const LABEL: Record<ScanResult["result"], { title: string; tone: "ok" | "warn" | "bad" }> = {
  accepted: { title: "Checked in", tone: "ok" },
  already_checked_in: { title: "Already checked in", tone: "warn" },
  invalid: { title: "Not a valid ticket", tone: "bad" },
  wrong_event: { title: "Ticket for a different event", tone: "bad" },
  refunded: { title: "Refunded ticket", tone: "bad" },
  cancelled: { title: "Cancelled ticket", tone: "bad" },
  error: { title: "Couldn't check in", tone: "bad" },
};

const TONE = {
  ok: "border-[#1b6e3a] bg-[#e7f6ec] text-[#0f4a26]",
  warn: "border-[#8a5a00] bg-[#fff4e0] text-[#5c3b00]",
  bad: "border-[#b3261e] bg-[#fdecea] text-[#8c1d18]",
};

/** Same code again within this window is ignored (a phone held up to the camera). */
const REPEAT_MS = 4000;

/**
 * Phone-camera QR scanner for the door. Uses getUserMedia + jsQR, so it works
 * in iPhone Safari as well as Android Chrome. Decoding happens on the device;
 * only the scanned credential is sent to the server, which checks it in.
 */
export function QrScanner({ eventId, timeZone }: { eventId: string; timeZone: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "denied" | "unsupported">("idle");
  const [result, setResult] = useState<ScanResult | null>(null);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const handle = useCallback(async (code: string) => {
    const now = Date.now();
    if (busy.current || (last.current && last.current.code === code && now - last.current.at < REPEAT_MS)) return;
    busy.current = true;
    last.current = { code, at: now };
    try {
      const r = await scanCheckIn(eventId, code);
      setResult(r);
      if (navigator.vibrate) navigator.vibrate(r.result === "accepted" ? 80 : [60, 60, 60]);
      router.refresh();
    } catch {
      setResult({ result: "error", message: "No connection. Check the network and scan again." });
    } finally {
      busy.current = false;
    }
  }, [eventId, router]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setState("unsupported"); return; }
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setState("scanning");
      timer.current = window.setInterval(() => {
        const c = canvas.current;
        if (!c || v.readyState < 2 || !v.videoWidth) return;
        const w = Math.min(640, v.videoWidth);
        const h = Math.round((v.videoHeight / v.videoWidth) * w);
        c.width = w; c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, w, h);
        const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (found?.data) void handle(found.data);
      }, 200);
    } catch (e) {
      stop();
      setState((e as Error).name === "NotAllowedError" ? "denied" : "unsupported");
    }
  }, [handle, stop]);

  const label = result ? LABEL[result.result] : null;
  const time = result?.checkedInAt
    ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(result.checkedInAt))
    : null;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-sm bg-pp-black" style={{ aspectRatio: "4 / 3", maxWidth: "100%" }}>
        <video ref={video} playsInline muted className="h-full w-full object-cover" aria-label="Camera view for scanning tickets" hidden={state !== "scanning"} />
        <canvas ref={canvas} hidden />
        {state !== "scanning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-pp-cream">
            {state === "denied" && <p>Camera access was blocked. Allow the camera for this site in your browser settings, then try again.</p>}
            {state === "unsupported" && <p>This browser can&apos;t open the camera. Use the guest search below instead.</p>}
            {(state === "idle" || state === "denied") && (
              <button type="button" onClick={start} className={smallButton("primary", "min-h-12 px-6 text-base")}>Start camera</button>
            )}
            {state === "starting" && <p role="status">Opening camera…</p>}
          </div>
        )}
        {state === "scanning" && <div aria-hidden="true" className="pointer-events-none absolute inset-[15%] rounded-sm border-2 border-white/80" />}
      </div>

      {state === "scanning" && (
        <button type="button" onClick={() => { stop(); setState("idle"); }} className={smallButton("secondary")}>Stop camera</button>
      )}

      <div role="status" aria-live="assertive" aria-atomic="true">
        {result && label && (
          <div className={`rounded-sm border-2 p-4 ${TONE[label.tone]}`} data-testid="scan-result" data-result={result.result}>
            <p className="text-2xl font-bold">{label.title}</p>
            {result.attendeeName && <p className="mt-1 text-lg">{result.attendeeName}{result.ticketType ? ` · ${result.ticketType}` : ""}</p>}
            {result.result === "already_checked_in" && time && <p className="mt-1">First checked in at {time}.</p>}
            {result.message && <p className="mt-1">{result.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
