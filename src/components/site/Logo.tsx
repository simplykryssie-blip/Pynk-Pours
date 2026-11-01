import Image from "next/image";
import Link from "next/link";
import { cx } from "@/components/ui/primitives";

/**
 * The official PynkPours emblem, used unaltered (no recolouring, cropping or
 * redrawing). The name beside it is plain text, not a recreated wordmark.
 * A horizontal wordmark / transparent asset will replace this once supplied.
 */
export function Logo({ size = 48, withName = true, className }: { size?: number; withName?: boolean; className?: string }) {
  return (
    <Link href="/" className={cx("inline-flex items-center gap-3", className)} aria-label="PynkPours — home">
      <Image
        src="/brand/pynkpours-emblem.jpg"
        alt=""
        width={size}
        height={size}
        className="rounded-full"
        priority
      />
      {withName && <span className="font-serif text-2xl leading-none text-pp-cream">PynkPours</span>}
    </Link>
  );
}
