import Image from "next/image";

type LogoVariant = "full" | "mark" | "icon";

interface AbyvoraLogoProps {
  variant?: LogoVariant;
  className?: string;
  height?: number;
}

const SRC: Record<LogoVariant, string> = {
  full: "/brand/abyvora-logo-full.png",
  mark: "/brand/abyvora-mark.png",
  icon: "/brand/abyvora-icon.png",
};

const ASPECT: Record<LogoVariant, number> = {
  full: 524 / 439,
  mark: 366 / 337,
  icon: 1,
};

/** ABYVORA wordmark + mark, or mark-only / icon-only variants. */
export function AbyvoraLogo({ variant = "full", className = "", height = 40 }: AbyvoraLogoProps) {
  const width = Math.round(height * ASPECT[variant]);
  return (
    <Image
      src={SRC[variant]}
      alt="ABYVORA Technologies"
      width={width}
      height={height}
      className={className}
      style={{ height, width: "auto", objectFit: "contain" }}
      priority
    />
  );
}

/** Symbol-only mark, for compact/collapsed placements. */
export function AbyvoraMark({ className = "", size = 32 }: { className?: string; size?: number }) {
  return <AbyvoraLogo variant="mark" height={size} className={className} />;
}
