import { forwardRef } from "react";
import type { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  ({ className = "", error, style, ...props }, ref) => (
    <input
      ref={ref}
      className={`field-input ${className}`}
      style={error ? { borderColor: "var(--danger)", ...style } : style}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  ({ className = "", error, style, ...props }, ref) => (
    <textarea
      ref={ref}
      className={`field-input ${className}`}
      style={{ resize: "vertical", minHeight: "90px", ...(error ? { borderColor: "var(--danger)" } : {}), ...style }}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export function Label({ className = "", children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`field-label ${className}`} {...props}>
      {children}
    </label>
  );
}

export function HelperText({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p className="text-xs mt-1.5" style={{ color: error ? "var(--danger)" : "var(--text-muted)" }}>
      {children}
    </p>
  );
}
