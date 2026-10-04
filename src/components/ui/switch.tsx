export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center rounded-full transition-colors disabled:opacity-50"
      style={{
        width: 40,
        height: 22,
        background: checked ? "var(--brand)" : "var(--border)",
      }}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform"
        style={{
          width: 16,
          height: 16,
          transform: checked ? "translateX(21px)" : "translateX(3px)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}
