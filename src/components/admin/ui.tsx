import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

export function PageHeader({ title, subtitle, actions, back }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 space-y-3">
      {back && <Link href={back.href} className="text-sm text-pp-black/70 hover:text-pp-pink-strong">← {back.label}</Link>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-pp-black/70">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-sm border border-pp-black/10 bg-white p-4 shadow-sm sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-sm border border-pp-black/10 bg-white p-4 shadow-sm" data-testid={`stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <p className="text-xs font-semibold tracking-[0.12em] text-pp-black/60 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl" data-testid="stat-value">{value}</p>
      {hint && <p className="mt-1 text-xs text-pp-black/60">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-pp-black/10 text-pp-black",
  published: "bg-[#e3f4e8] text-[#14532d]",
  cancelled: "bg-[#fdecea] text-[#8c1d18]",
  completed: "bg-[#e8eefb] text-[#1e3a8a]",
  archived: "bg-[#efe7da] text-[#5c4415]",
  paid: "bg-[#e3f4e8] text-[#14532d]",
  pending: "bg-[#fff4d6] text-[#7a5300]",
  failed: "bg-[#fdecea] text-[#8c1d18]",
  refunded: "bg-[#fdecea] text-[#8c1d18]",
  partially_refunded: "bg-[#fff4d6] text-[#7a5300]",
  valid: "bg-[#e3f4e8] text-[#14532d]",
  active: "bg-[#e3f4e8] text-[#14532d]",
  paused: "bg-[#fff4d6] text-[#7a5300]",
  closed: "bg-pp-black/10 text-pp-black",
  inactive: "bg-pp-black/10 text-pp-black",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cx("inline-block rounded-sm px-2 py-0.5 text-xs font-semibold capitalize", STATUS_STYLES[status] ?? "bg-pp-black/10")}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "error" | "warning"; children: ReactNode }) {
  const styles = {
    info: "border-[#1e3a8a]/20 bg-[#eef3fd] text-[#1e3a8a]",
    success: "border-[#1e6b3a]/30 bg-[#e8f5ec] text-[#14532d]",
    error: "border-[#b3261e]/30 bg-[#fdecea] text-[#8c1d18]",
    warning: "border-[#7a5300]/30 bg-[#fff4d6] text-[#5c3d00]",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-sm border px-4 py-3 text-sm", styles)}>{children}</div>;
}

/** Horizontally scrollable table wrapper so wide tables never break phone layouts. */
export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-pp-black/10 [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-pp-black/60 [&_th]:uppercase">
        {children}
      </table>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-pp-black/20 bg-white/60 p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-pp-black/70">{children}</div>}
    </div>
  );
}

export const smallButton = (variant: "primary" | "secondary" | "danger" = "secondary", extra?: string) =>
  cx(
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-sm border px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-60",
    variant === "primary" && "border-pp-pink-strong bg-pp-pink-strong text-white hover:bg-[#a5134c]",
    variant === "secondary" && "border-pp-black/25 bg-white text-pp-black hover:border-pp-black",
    variant === "danger" && "border-[#b3261e]/40 bg-white text-[#8c1d18] hover:bg-[#fdecea]",
    extra,
  );
