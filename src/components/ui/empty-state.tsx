export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{title}</p>
      {description && (
        <p className="text-[12.5px] mt-1 max-w-xs" style={{ color: "var(--text-secondary)" }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
