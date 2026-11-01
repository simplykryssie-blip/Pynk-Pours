import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PolicyPage } from "@/components/site/PolicyPage";
import { Container } from "@/components/ui/primitives";
import { getCustomPage } from "@/server/data/pages";

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCustomPage(slug).catch(() => null);
  return page ? { title: page.title } : { title: "Page not found", robots: { index: false } };
}

/** Pages the owner creates in the dashboard (Policies → New page). Only published pages are shown. */
export default function CustomPolicyPage({ params }: PageProps<"/policies/[slug]">) {
  return (
    <Suspense fallback={<Container className="py-24"><p role="status" className="text-pp-cream/75">Loading…</p></Container>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/policies/[slug]">["params"] }) {
  const { slug } = await params;
  const page = await getCustomPage(slug);
  if (!page) notFound();
  return <PolicyPage policy={page} />;
}
