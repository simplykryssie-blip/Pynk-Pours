"use client";

/* eslint-disable @next/next/no-img-element -- the QR code is an inline SVG data URI from Supabase */
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/primitives";
import { confirmEnrollment, signIn, startEnrollment, verifyMfa, type AuthState } from "@/server/auth/actions";

const field = "mt-1 block w-full rounded-sm border border-white/25 bg-white/5 px-3.5 py-3 text-base text-pp-cream outline-none focus:border-pp-pink focus:ring-2 focus:ring-pp-pink/30";

function Submit({ children, pending: label }: { children: React.ReactNode; pending: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>{pending ? label : children}</button>;
}

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-sm border border-[#ffb4ab]/40 bg-[#ffb4ab]/10 px-3 py-2 text-sm text-[#ffdad6]">{message}</p>;
}

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState(signIn, { status: "idle" });
  return (
    <form action={action} className="space-y-4">
      {notice && state.status === "idle" && <p role="status" className="text-sm text-pp-cream/80">{notice}</p>}
      <ErrorBox message={state.status === "error" ? state.message : undefined} />
      <div>
        <label htmlFor="login-email" className="text-sm font-medium text-pp-cream">Email</label>
        <input id="login-email" name="email" type="email" autoComplete="username" required className={field} />
      </div>
      <div>
        <label htmlFor="login-password" className="text-sm font-medium text-pp-cream">Password</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required className={field} />
      </div>
      <Submit pending="Signing in…">Sign in</Submit>
    </form>
  );
}

function CodeInput() {
  return (
    <div>
      <label htmlFor="mfa-code" className="text-sm font-medium text-pp-cream">6-digit code</label>
      <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
        className={`${field} text-center font-mono text-2xl tracking-[0.5em]`} />
    </div>
  );
}

export function MfaVerifyForm() {
  const [state, action] = useActionState(verifyMfa, { status: "idle" });
  return (
    <form action={action} className="space-y-4">
      <ErrorBox message={state.status === "error" ? state.message : undefined} />
      <CodeInput />
      <Submit pending="Verifying…">Verify</Submit>
    </form>
  );
}

export function MfaEnrollForm() {
  const [enrollment, setEnrollment] = useState<AuthState | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action] = useActionState(confirmEnrollment, { status: "idle" });
  const current = state.status !== "idle" ? { ...enrollment, ...state } : enrollment;

  if (!enrollment || enrollment.status !== "enrolling") {
    return (
      <div className="space-y-4">
        <ErrorBox message={enrollment?.message} />
        <ol className="list-decimal space-y-1 pl-5 text-sm text-pp-cream/85">
          <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password or similar).</li>
          <li>Tap “Set up authenticator” and scan the QR code.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <button type="button" disabled={starting} className={buttonClass("primary", "w-full")}
          onClick={() => startTransition(async () => setEnrollment(await startEnrollment()))}>
          {starting ? "Preparing…" : "Set up authenticator"}
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <div className="mx-auto w-fit rounded-sm bg-white p-3">
        <img src={enrollment.qrCode} alt="QR code to add PynkPours to your authenticator app" width={200} height={200} />
      </div>
      <details className="text-sm text-pp-cream/80">
        <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
        <code className="mt-2 block rounded-sm bg-white/10 p-2 font-mono break-all select-all" data-testid="totp-secret">{enrollment.secret}</code>
      </details>
      <ErrorBox message={current?.message} />
      <CodeInput />
      <Submit pending="Verifying…">Confirm and continue</Submit>
    </form>
  );
}
