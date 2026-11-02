import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHero } from "@/components/site/PageHero";
import { Container } from "@/components/ui/primitives";
import { formatEventDate } from "@/lib/datetime";
import { answerText, statusLabel, type AnswerValue, type FormField } from "@/lib/forms";
import { hashCredential } from "@/server/credentials";
import { serviceDb } from "@/server/supabase";

export const metadata: Metadata = { title: "Your response", robots: { index: false, follow: false } };

const MEANING: Record<string, string> = {
  new: "We've received it and will review it soon.",
  reviewing: "We're reviewing it now.",
  approved: "Approved! We'll be in touch with next steps.",
  waitlisted: "You're on our waitlist. We'll contact you if a spot opens up.",
  declined: "Thank you for your interest. We aren't able to move forward this time.",
};

/** Private status page for one response (the link is emailed to the applicant). */
export default function StatusPage({ params, searchParams }: PageProps<"/forms/status/[token]">) {
  return (
    <Suspense fallback={<Container className="py-24"><p role="status" className="text-pp-cream/75">Loading…</p></Container>}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/forms/status/[token]">, "params" | "searchParams">) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const { data } = await serviceDb().from("form_submissions")
    .select("status, created_at, data, forms(title, fields, confirmation_message)").eq("status_token_hash", hashCredential(token)).maybeSingle();
  const s = data as unknown as { status: string; created_at: string; data: Record<string, AnswerValue>; forms: { title: string; fields: FormField[]; confirmation_message: string } } | null;
  if (!s) notFound();
  return (
    <>
      <PageHero title={s.forms.title} eyebrow="Your response" />
      <section className="bg-pp-blush-light py-14 text-pp-black sm:py-16">
        <Container className="max-w-2xl space-y-6">
          {sp.sent === "1" && (
            <div role="status" className="rounded-sm border border-[#1e6b3a]/30 bg-[#e8f5ec] p-4 text-[#14532d]">
              <p className="font-semibold">Thank you, your response was sent.</p>
              <p className="mt-1 text-sm">We&apos;ve emailed you a copy with this private link. Bookmark this page to check your status.</p>
              {s.forms.confirmation_message && <p className="mt-2 whitespace-pre-line">{s.forms.confirmation_message}</p>}
            </div>
          )}
          <div className="rounded-sm border border-pp-black/10 bg-white p-6">
            <p className="text-sm text-pp-black/70">Status</p>
            <p className="mt-1 font-serif text-3xl" data-testid="form-status">{statusLabel(s.status)}</p>
            <p className="mt-2 text-pp-black/80">{MEANING[s.status]}</p>
            <p className="mt-4 text-xs text-pp-black/60">Sent {formatEventDate(s.created_at, "America/Chicago")}</p>
          </div>
          <details className="rounded-sm border border-pp-black/10 bg-white p-6">
            <summary className="cursor-pointer font-semibold">What you sent</summary>
            <dl className="mt-4 space-y-3 text-sm">
              {s.forms.fields.map((f) => (
                <div key={f.key}><dt className="text-pp-black/60">{f.label}</dt><dd className="whitespace-pre-wrap">{answerText(s.data[f.key]) || "—"}</dd></div>
              ))}
            </dl>
          </details>
          <p className="text-sm text-pp-black/70">Need to change something? Email hello@pynkpours.com.</p>
        </Container>
      </section>
    </>
  );
}
