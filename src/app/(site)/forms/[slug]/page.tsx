import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicForm } from "@/components/forms/PublicForm";
import { PageHero } from "@/components/site/PageHero";
import { Container } from "@/components/ui/primitives";
import { formatEventDate } from "@/lib/datetime";
import type { FormField } from "@/lib/forms";
import { publicDb } from "@/server/supabase";

type PublicFormRow = { slug: string; title: string; description: string; status: string; closes_at: string | null; fields: FormField[]; events: { title: string; starts_at: string | null; timezone: string | null } | null };

async function load(slug: string): Promise<PublicFormRow | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const { data } = await publicDb().from("forms")
    .select("slug, title, description, status, closes_at, fields, events(title, starts_at, timezone)").eq("slug", slug).maybeSingle();
  return data as unknown as PublicFormRow | null;
}

export async function generateMetadata({ params }: PageProps<"/forms/[slug]">): Promise<Metadata> {
  const f = await load((await params).slug).catch(() => null);
  return f ? { title: f.title, description: f.description.slice(0, 160) || undefined } : { title: "Form not found", robots: { index: false } };
}

/** Public forms built in the dashboard (Forms). Drafts are never shown. */
export default function FormPage({ params }: PageProps<"/forms/[slug]">) {
  return (
    <Suspense fallback={<Container className="py-24"><p role="status" className="text-pp-cream/75">Loading…</p></Container>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/forms/[slug]">["params"] }) {
  await connection();
  const f = await load((await params).slug);
  if (!f) notFound();
  const closed = f.status !== "open" || (f.closes_at !== null && new Date(f.closes_at) <= new Date());
  return (
    <>
      <PageHero title={f.title} eyebrow={f.events ? f.events.title : undefined} />
      <section className="bg-pp-blush-light py-14 text-pp-black sm:py-16">
        <Container className="max-w-2xl">
          {f.description && <div className="mb-8 space-y-3 leading-relaxed whitespace-pre-line">{f.description}</div>}
          {f.events?.starts_at && <p className="mb-6 text-sm text-pp-black/70">Event date: {formatEventDate(f.events.starts_at, f.events.timezone ?? "America/Chicago")}</p>}
          {closed ? (
            <div role="status" className="rounded-sm border border-pp-black/15 bg-white p-6">
              <p className="font-serif text-2xl">This form is closed</p>
              <p className="mt-2 text-pp-black/75">It&apos;s no longer accepting responses. Questions? Contact us at hello@pynkpours.com.</p>
            </div>
          ) : (
            <>
              {f.closes_at && <p className="mb-6 text-sm text-pp-black/70">Open until {formatEventDate(f.closes_at, "America/Chicago")}.</p>}
              <PublicForm slug={f.slug} fields={f.fields} />
            </>
          )}
        </Container>
      </section>
    </>
  );
}
