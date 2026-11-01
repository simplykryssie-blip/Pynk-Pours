import { PageHero } from "@/components/site/PageHero";
import { Container } from "@/components/ui/primitives";
import { parsePolicyText, type PolicyBlock } from "@/lib/policy-text";
import type { StoredPolicy } from "@/server/data/pages";

function Blocks({ blocks, lead = false }: { blocks: PolicyBlock[]; lead?: boolean }) {
  return blocks.map((b, i) =>
    b.kind === "p"
      ? <p key={i} className={lead ? "text-lg" : undefined}>{b.text}</p>
      : <ul key={i} className="list-disc space-y-2 pl-6">{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>,
  );
}

/** A policy edited in the dashboard (plain text, never rendered as HTML). */
export function PolicyPage({ policy }: { policy: StoredPolicy }) {
  const content = parsePolicyText(policy.text);
  return (
    <>
      <PageHero title={policy.title} />
      <section className="bg-pp-cream py-14 text-pp-black sm:py-16">
        <Container className="max-w-3xl">
          <p className="text-sm text-pp-black/65">Last updated {policy.updated}</p>
          <div className="mt-6 space-y-4 leading-relaxed"><Blocks blocks={content.intro} lead /></div>
          <div className="mt-10 space-y-10">
            {content.sections.map((s, i) => (
              <section key={i} aria-labelledby={`policy-${i}`}>
                <h2 id={`policy-${i}`} className="font-serif text-2xl">{i + 1}. {s.heading}</h2>
                <div className="mt-3 space-y-3 leading-relaxed text-pp-black/85"><Blocks blocks={s.blocks} /></div>
              </section>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
