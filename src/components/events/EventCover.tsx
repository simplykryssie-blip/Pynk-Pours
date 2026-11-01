import Image from "next/image";
import { cx } from "@/components/ui/primitives";
import { eventImageUrl, type PublicEvent } from "@/server/data/events";

/**
 * Event cover image from admin-uploaded media. Without one, a typographic brand
 * panel is shown — never stock photography standing in for a real event.
 */
export function EventCover({ event, className, priority }: {
  event: Pick<PublicEvent, "title" | "cover_image_path" | "cover_image_alt" | "category_label">;
  className?: string;
  priority?: boolean;
}) {
  const src = eventImageUrl(event.cover_image_path);
  if (src) {
    return (
      <div className={cx("relative overflow-hidden bg-pp-charcoal", className)}>
        <Image src={src} alt={event.cover_image_alt ?? ""} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority={priority} />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cx(
        "relative flex items-center justify-center overflow-hidden bg-pp-black",
        "bg-[radial-gradient(ellipse_at_30%_20%,#5a1f3d_0,var(--pp-plum)_35%,var(--pp-black)_75%)]",
        className,
      )}
    >
      <div className="absolute top-1/2 left-1/2 aspect-square h-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-pp-gold/30" />
      <p className="relative px-8 text-center font-serif text-2xl leading-tight text-pp-cream/90 italic sm:text-3xl">
        {event.title}
      </p>
    </div>
  );
}
