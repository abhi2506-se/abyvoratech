export function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="abv-kpi-card">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        {icon && (
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: tone === "accent" ? "var(--accent-soft)" : "var(--bg)",
              color: tone === "accent" ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="text-[26px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
