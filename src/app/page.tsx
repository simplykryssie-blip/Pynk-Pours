import Image from "next/image";

/**
 * Stage A holding page. The public site (Home, About, Experiences, Event
 * detail, Partners, Contact) is built in Stage B. No event details appear here.
 */
export default function HoldingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <Image
        src="/brand/pynkpours-emblem.jpg"
        width={1254}
        height={1254}
        alt="PynkPours — Where Ideas Meet Opportunity. Sip, Connect, Create."
        priority
        sizes="(max-width: 640px) 70vw, 360px"
        className="h-auto w-[70vw] max-w-[360px] rounded-full"
      />
      <p className="font-sans text-xs tracking-[0.35em] text-pp-gold uppercase">Sip • Connect • Create</p>
      <p className="max-w-md font-serif text-2xl text-pp-cream">Our new website is on its way.</p>
    </main>
  );
}
