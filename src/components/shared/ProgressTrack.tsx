export function ProgressTrack({ value, max = 100 }: { value: number; max?: number }) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const fillColor =
    percentage >= 75 ? "bg-emerald-500" :
    percentage >= 40 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#6b6b6b]">Confidence</span>
        <span className="text-[11px] font-semibold text-[#0f0f0f]">{Math.round(percentage)}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-black/[0.08] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${fillColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
