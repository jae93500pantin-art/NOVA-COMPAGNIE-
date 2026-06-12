import { Reveal } from "./Reveal";

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "center" | "left";
}) {
  return (
    <Reveal>
      <div
        className={
          align === "center"
            ? "mx-auto max-w-2xl text-center"
            : "max-w-2xl text-left"
        }
      >
        <span className="section-eyebrow mb-4">{eyebrow}</span>
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-4 text-base leading-relaxed text-white/55">
            {subtitle}
          </p>
        )}
      </div>
    </Reveal>
  );
}
