import { contactDetails } from "@/content/site";
import { FacebookIcon, InstagramIcon, TikTokIcon } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

const ICONS = { Instagram: InstagramIcon, TikTok: TikTokIcon, Facebook: FacebookIcon } as const;

/** Owner's social profiles (src/content/site.ts). Opens in a new tab. */
export function SocialLinks({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  if (contactDetails.social.length === 0) return null;
  return (
    <ul className={cx("flex items-center gap-2", className)} aria-label="PynkPours on social media">
      {contactDetails.social.map(({ label, href }) => {
        const Icon = ICONS[label];
        return (
          <li key={label}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`PynkPours on ${label} (opens in a new tab)`}
              className={cx(
                "inline-flex size-11 items-center justify-center rounded-full border transition-colors",
                tone === "dark"
                  ? "border-white/20 text-pp-cream/85 hover:border-pp-pink hover:text-pp-pink"
                  : "border-pp-black/20 text-pp-black/80 hover:border-pp-pink-strong hover:text-pp-pink-strong",
              )}
            >
              <Icon width={20} height={20} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
