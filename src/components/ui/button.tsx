import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "icon";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] whitespace-nowrap select-none";

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-[10px]",
  md: "text-[13.5px] px-4.5 py-2.5 rounded-[10px]",
  lg: "text-sm px-6 py-3 rounded-xl",
};

function variantStyle(variant: Variant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return { background: "var(--brand)", color: "var(--brand-contrast)", boxShadow: "var(--shadow-sm)" };
    case "secondary":
      return { background: "var(--surface)", color: "var(--text-primary)", border: "1px solid var(--border)" };
    case "outline":
      return { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)" };
    case "ghost":
      return { background: "transparent", color: "var(--text-secondary)" };
    case "danger":
      return { background: "var(--danger)", color: "#ffffff" };
    case "success":
      return { background: "var(--success)", color: "#ffffff" };
    case "icon":
      return { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" };
    default:
      return {};
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", style, children, ...props }, ref) => {
    const sizeCls = variant === "icon" ? "w-9 h-9 rounded-full p-0" : sizeClasses[size];
    return (
      <button
        ref={ref}
        className={`${base} ${sizeCls} ${className} abv-btn-${variant}`}
        style={{ ...variantStyle(variant), ...style }}
        onMouseEnter={(e) => {
          if (variant === "primary" || variant === "danger" || variant === "success") {
            e.currentTarget.style.opacity = "0.88";
          } else if (variant === "secondary" || variant === "outline" || variant === "icon") {
            e.currentTarget.style.background = "var(--bg)";
          } else if (variant === "ghost") {
            e.currentTarget.style.background = "var(--accent-soft)";
          }
        }}
        onMouseLeave={(e) => {
          const s = variantStyle(variant);
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.background = (s.background as string) ?? "transparent";
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
