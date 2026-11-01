import Image from "next/image";
import Link from "next/link";
import { EventCover } from "@/components/events/EventCover";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import { TicketList } from "@/components/events/TicketList";
import { eventWhen, eventWhere } from "@/components/events/format";
import { ArrowIcon, CalendarIcon, ClockIcon, PinIcon } from "@/components/ui/icons";
import { Badge, Container } from "@/components/ui/primitives";
import type { Registration } from "@/lib/registration";
import { eventImageUrl, type GalleryImage, type PublicEvent, type TicketOption } from "@/server/data/events";

/**
 * The public event page body. Shared by the live page and the admin preview so
 * staff see exactly what visitors will see.
 */
export function EventView({ event, options, registration, gallery, preview = false }: {
  event: PublicEvent;
  options: TicketOption[];
  registration: Registration;
  gallery: GalleryImage[];
  preview?: boolean;
}) {
  const when = eventWhen(event);
  const hasDate = Boolean(event.starts_at && event.timezone);

  return (
    <article>
      {/* Header */}
      <section className="bg-pp-black">
        <Container className="pt-6">
          {!preview && (
            <Link href="/events" className="inline-flex items-center gap-2 text-sm text-pp-cream/80 hover:text-pp-pink">
              <ArrowIcon width={16} height={16} className="rotate-180" /> Back to events
            </Link>
          )}
        </Container>
        <Container className="grid gap-10 py-10 lg:grid-cols-[1.4fr_1fr] lg:py-14">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {event.category_label && <Badge>{event.category_label}</Badge>}
              {registration.state !== "on_sale" && <Badge tone="muted">{registration.label}</Badge>}
            </div>
            <h1 className="font-serif text-4xl leading-[1.05] text-pp-cream sm:text-6xl">{event.title}</h1>
            {event.short_description && <p className="max-w-2xl text-lg text-pp-cream/80">{event.short_description}</p>}
            <EventCover event={event} priority className="aspect-[16/9] w-full" />
          </div>

          <aside id="register" aria-label="Registration" className="h-fit space-y-6 border border-pp-gold/30 bg-pp-charcoal p-6 sm:p-8 lg:sticky lg:top-24">
            <ul className="space-y-3 text-pp-cream">
              <li className="flex items-start gap-3"><CalendarIcon className="mt-0.5 shrink-0 text-pp-pink" />{when.date}</li>
              {when.time && <li className="flex items-start gap-3"><ClockIcon className="mt-0.5 shrink-0 text-pp-pink" />{when.time}</li>}
              <li className="flex items-start gap-3"><PinIcon className="mt-0.5 shrink-0 text-pp-pink" />
                <span>{eventWhere(event)}{event.venue_address && <span className="block text-sm text-pp-cream/70">{event.venue_address}</span>}</span>
              </li>
            </ul>
            {hasDate && !preview && registration.state !== "cancelled" && registration.state !== "past" && (
              <a href={`/events/${event.slug}/calendar`} className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-pp-gold uppercase hover:underline">
                <CalendarIcon width={16} height={16} /> Add to calendar
              </a>
            )}
            <div className="border-t border-white/10 pt-6">
              {preview ? (
                <div className="space-y-2 text-pp-cream/85">
                  <p className="text-sm font-semibold tracking-[0.2em] text-pp-gold uppercase">{registration.label}</p>
                  <p className="text-sm">Registration controls for this state appear here once the event is published.</p>
                </div>
              ) : (
                <RegistrationPanel event={event} registration={registration} />
              )}
            </div>
          </aside>
        </Container>
      </section>

      {/* Body */}
      <section className="bg-pp-blush-light py-14 text-pp-black sm:py-20">
        <Container className="grid gap-14 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-14">
            {event.description && (
              <div>
                <h2 className="font-serif text-3xl italic">About this experience</h2>
                <div className="mt-4 space-y-4 text-lg leading-relaxed text-pp-black/80">
                  {event.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
                </div>
              </div>
            )}
            {options.length > 0 && (
              <div id="tickets">
                <h2 className="font-serif text-3xl italic">Ticket options</h2>
                <div className="mt-6"><TicketList options={options} timezone={event.timezone} /></div>
              </div>
            )}
            {event.speakers.length > 0 && <Speakers event={event} />}
            {gallery.length > 0 && <Gallery images={gallery} />}
            {event.faqs.length > 0 && (
              <div>
                <h2 className="font-serif text-3xl italic">Frequently asked questions</h2>
                <div className="mt-6 divide-y divide-pp-black/10 border-y border-pp-black/10">
                  {event.faqs.map((f, i) => (
                    <details key={i} className="group py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                        {f.question}<span aria-hidden className="text-xl text-pp-pink-strong group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-3 text-pp-black/80">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-10">
            {event.agenda.length > 0 && (
              <div>
                <h2 className="font-serif text-3xl italic">Schedule</h2>
                <ol className="mt-6 space-y-4 border-l-2 border-pp-pink-strong/40 pl-5">
                  {event.agenda.map((a, i) => (
                    <li key={i}>
                      {a.time && <p className="text-sm font-semibold text-pp-pink-strong">{a.time}</p>}
                      <p className="font-semibold">{a.title}</p>
                      {a.description && <p className="text-sm text-pp-black/75">{a.description}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <Details event={event} />
          </div>
        </Container>
      </section>
    </article>
  );
}

function Details({ event }: { event: PublicEvent }) {
  const rows = [
    ["Dress code", event.dress_code],
    ["Age requirement", event.min_age ? `${event.min_age}+ (valid ID may be required)` : null],
    ["Venue notes", event.venue_notes],
    ["Parking", event.parking_info],
    ["Accessibility", event.accessibility_info],
    ["Refund policy", event.refund_policy],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  if (rows.length === 0) return null;
  return (
    <div className="bg-white p-6">
      <h2 className="font-serif text-2xl italic">Event details</h2>
      <dl className="mt-4 space-y-4">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-xs font-bold tracking-[0.15em] text-pp-gold-deep uppercase">{k}</dt><dd className="mt-1 text-pp-black/80">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function Speakers({ event }: { event: PublicEvent }) {
  return (
    <div>
      <h2 className="font-serif text-3xl italic">Featured speakers</h2>
      <ul className="mt-6 grid gap-6 sm:grid-cols-2">
        {event.speakers.map((s) => (
          <li key={s.name} className="bg-white p-5">
            <p className="font-serif text-xl">{s.name}</p>
            {s.title && <p className="text-xs font-bold tracking-[0.15em] text-pp-gold-deep uppercase">{s.title}</p>}
            {s.bio && <p className="mt-2 text-sm text-pp-black/75">{s.bio}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}


function Gallery({ images }: { images: GalleryImage[] }) {
  return (
    <div>
      <h2 className="font-serif text-3xl italic">Gallery</h2>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img) => {
          const src = eventImageUrl(img.storage_path);
          return src ? (
            <li key={img.id} className="relative aspect-square overflow-hidden bg-pp-charcoal">
              <Image src={src} alt={img.alt_text ?? ""} fill unoptimized sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
            </li>
          ) : null;
        })}
      </ul>
    </div>
  );
}
