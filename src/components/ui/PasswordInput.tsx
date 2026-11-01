"use client";

import { useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

/**
 * Password field with a show/hide toggle so people can check what they typed.
 * The field reverts to hidden after each form submission (React resets the
 * form), and the toggle never sends the password anywhere.
 */
export function PasswordInput({
  className,
  tone = "dark",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { tone?: "dark" | "light" }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={cx(className, "pr-12")}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        className={cx(
          "absolute inset-y-0 right-0 mt-1 flex w-12 items-center justify-center rounded-r-sm outline-none focus-visible:ring-2",
          tone === "dark" ? "text-pp-cream/80 hover:text-pp-cream focus-visible:ring-pp-pink/50" : "text-pp-black/70 hover:text-pp-black focus-visible:ring-pp-pink-strong/40",
        )}
      >
        {visible ? <EyeOffIcon width={22} height={22} /> : <EyeIcon width={22} height={22} />}
      </button>
    </div>
  );
}
