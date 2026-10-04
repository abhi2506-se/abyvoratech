import type { HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const toneVars: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--bg)", fg: "var(--text-secondary)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ tone = "neutral", dot = false, className = "", children, style, ...props }: BadgeProps) {
  const t = toneVars[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${className}`}
      style={{ background: t.bg, color: t.fg, ...style }}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.fg }} />}
      {children}
    </span>
  );
}
