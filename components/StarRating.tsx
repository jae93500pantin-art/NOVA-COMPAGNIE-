import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  size = 14,
  showValue = false,
  className,
}: {
  value: number;
  size?: number;
  showValue?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => {
          const fill = Math.max(0, Math.min(1, value - i));
          return (
            <span key={i} className="relative" style={{ width: size, height: size }}>
              <Star
                className="absolute inset-0 text-white/15"
                style={{ width: size, height: size }}
                strokeWidth={1.5}
              />
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className="text-gold-400"
                  fill="currentColor"
                  style={{ width: size, height: size }}
                  strokeWidth={1.5}
                />
              </span>
            </span>
          );
        })}
      </span>
      {showValue && (
        <span className="text-sm font-semibold text-white">
          {value.toFixed(2)}
        </span>
      )}
    </span>
  );
}
