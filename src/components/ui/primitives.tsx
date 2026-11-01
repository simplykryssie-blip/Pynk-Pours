import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

type Variant = "primary" | "secondary" | "secondary-light" | "dark";

const variants: Record<Variant, string> = {
  primary:
    "bg-pp-pink-strong text-white border-pp-pink-strong hover:bg-[#a5134c] hover:border-[#a5134c]",
  secondary: "bg-transparent text-pp-cream border-pp-gold hover:bg-pp-gold hover:text-pp-black",
  "secondary-light": "bg-transparent text-pp-black border-pp-black hover:bg-pp-black hover:text-pp-cream",
  dark: "bg-pp-black text-pp-cream border-pp-black hover:bg-pp-charcoal",
};

export const buttonClass = (variant: Variant = "primary", className?: string) =>
  cx(
    "inline-flex min-h-11 items-center justify-center gap-2 border px-6 py-3 text-xs font-semibold",
    "tracking-[0.18em] uppercase transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    className,
  );

export function LinkButton({
  variant = "primary", className, children, ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link className={buttonClass(variant, className)} {...props}>
      {children}
    </Link>
  );
}

export function Eyebrow({ children, tone = "gold", className }: { children: ReactNode; tone?: "gold" | "deep" | "pink"; className?: string }) {
  const color = { gold: "text-pp-gold", deep: "text-pp-gold-deep", pink: "text-pp-pink-strong" }[tone];
  return <p className={cx("text-[0.7rem] font-semibold tracking-[0.3em] uppercase", color, className)}>{children}</p>;
}

export function Badge({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "dark" | "muted" | "pink" }) {
  const styles = {
    gold: "bg-pp-gold text-pp-black",
    dark: "bg-pp-black text-pp-cream",
    muted: "bg-pp-charcoal text-pp-muted",
    pink: "bg-pp-pink-strong text-white",
  }[tone];
  return (
    <span className={cx("inline-block rounded-sm px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.15em] uppercase", styles)}>
      {children}
    </span>
  );
}
