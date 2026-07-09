import { Check, Clock3, AlertCircle, HelpCircle } from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Check }> = {
  proficient: { label: "Proficient", color: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: Check },
  strong: { label: "Strong", color: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: Check },
  developing: { label: "Developing", color: "border-amber-200 bg-amber-50 text-amber-700", icon: Clock3 },
  partial: { label: "Partial", color: "border-amber-200 bg-amber-50 text-amber-700", icon: Clock3 },
  needs_review: { label: "Needs Review", color: "border-red-200 bg-red-50 text-red-600", icon: AlertCircle },
  new: { label: "New", color: "border-black/[0.1] bg-black/[0.04] text-[#6b6b6b]", icon: HelpCircle },
  unknown: { label: "Unknown", color: "border-black/[0.1] bg-black/[0.04] text-[#6b6b6b]", icon: HelpCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status.toLowerCase()] ?? statusConfig.unknown;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${config.color}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
}
