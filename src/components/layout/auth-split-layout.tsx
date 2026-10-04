import { AbyvoraLogo } from "@/components/brand/abyvora-logo";

export function AuthSplitLayout({
  children,
  heading,
  subheading,
}: {
  children: React.ReactNode;
  heading?: string;
  subheading?: string;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--bg)" }}>
      {/* Brand panel */}
      <div
        className="relative hidden lg:flex flex-col justify-between overflow-hidden px-14 py-12"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <BrandPattern />
        <div className="relative z-10">
          <AbyvoraLogo variant="mark" height={40} />
        </div>

        <div className="relative z-10 max-w-md">
          <p
            className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-4"
            style={{ color: "var(--gold)" }}
          >
            Ideas Beyond Tomorrow
          </p>
          <h2 className="text-[34px] leading-[1.15] font-semibold text-white mb-4">
            Build. Manage. Grow.
          </h2>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--sidebar-text)" }}>
            One workspace for your clients, projects, proposals, payments and support —
            engineered for teams who move fast and deliver premium work.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px]" style={{ color: "var(--sidebar-text)" }}>
          <span>© {new Date().getFullYear()} ABYVORA Technologies</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center mb-7 lg:hidden">
            <AbyvoraLogo variant="mark" height={44} />
          </div>

          {(heading || subheading) && (
            <div className="text-center mb-7">
              {heading && (
                <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {heading}
                </h1>
              )}
              {subheading && (
                <p className="text-[13px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                  {subheading}
                </p>
              )}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

function BrandPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.35]"
      viewBox="0 0 600 800"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="abv-line-fade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C9A45C" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#C9A45C" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 7 }).map((_, i) => (
        <path
          key={i}
          d={`M ${-50 + i * 90} 800 L ${250 + i * 60} 0`}
          stroke="url(#abv-line-fade)"
          strokeWidth="1"
        />
      ))}
      <circle cx="500" cy="150" r="180" stroke="#C9A45C" strokeOpacity="0.12" />
      <circle cx="500" cy="150" r="260" stroke="#C9A45C" strokeOpacity="0.08" />
    </svg>
  );
}
