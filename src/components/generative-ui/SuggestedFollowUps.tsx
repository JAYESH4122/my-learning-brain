export function SuggestedFollowUps({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (prompt: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((followUp) => (
        <button
          key={followUp}
          type="button"
          onClick={() => onSelect(followUp)}
          className="inline-flex items-center rounded-full border border-black/[0.09] bg-[#f8f7f4] px-3 py-1.5 text-xs font-medium text-[#6b6b6b] transition hover:border-black/[0.18] hover:bg-black/[0.06] hover:text-[#0f0f0f] active:scale-[0.98]"
        >
          {followUp}
        </button>
      ))}
    </div>
  );
}
