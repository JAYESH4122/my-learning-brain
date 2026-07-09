"use client";

import type { KnowledgeCheckData } from "./types";
import { ProgressTrack } from "@/src/components/shared/ProgressTrack";
import { StatusBadge } from "@/src/components/shared/StatusBadge";
import { MarkdownRenderer } from "@/src/components/shared/MarkdownRenderer";

export function KnowledgeCheckBlock({ data }: { data: KnowledgeCheckData }) {
  const scoreColor =
    data.confidenceScore >= 75 ? "text-emerald-600" :
    data.confidenceScore >= 40 ? "text-amber-600" : "text-red-500";
  const scoreBg =
    data.confidenceScore >= 75 ? "border-emerald-200 bg-emerald-50" :
    data.confidenceScore >= 40 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";

  return (
    <div className="min-w-0 space-y-4">
      {/* Header: topic + score circle */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
            Knowledge Check
          </p>
          <p className="mt-1 text-lg font-bold text-[#0f0f0f]">{data.topic}</p>
        </div>
        <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 ${scoreBg}`}>
          <span className={`text-lg font-bold leading-none ${scoreColor}`}>{data.confidenceScore}</span>
          <span className="text-[9px] font-medium text-[#9b9b9b]">%</span>
        </div>
      </div>

      {/* Status badge + related count */}
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusBadge status={data.status} />
        {data.relatedMemoriesCount > 0 && (
          <span className="text-xs text-[#9b9b9b]">
            {data.relatedMemoriesCount} {data.relatedMemoriesCount === 1 ? "memory" : "memories"} found
          </span>
        )}
      </div>

      {/* Progress track */}
      <ProgressTrack value={data.confidenceScore} />

      {/* Explanation card */}
      {data.explanation && (
        <div className="rounded-xl border border-black/[0.07] bg-white p-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
            Analysis
          </p>
          <MarkdownRenderer content={data.explanation} isUser={false} />
        </div>
      )}
    </div>
  );
}
