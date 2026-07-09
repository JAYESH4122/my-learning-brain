"use client";

import { AlertCircle, Check } from "lucide-react";
import type { CodeInspectorData } from "./types";
import { CodeBlock } from "@/src/components/shared/CodeBlock";

export function CodeInspectorBlock({ data }: { data: CodeInspectorData }) {
  return (
    <div className="min-w-0 space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[#0f0f0f]">{data.summary}</span>
      </div>

      {/* Improvements check-matrix */}
      {data.improvements.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-[#f8f7f4] p-3.5">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
            Improvements
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.improvements.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs leading-5 text-[#0f0f0f]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-side code panels */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Original code panel */}
        {data.originalCode && (
          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
              Original
            </p>
            <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-black/[0.08]">
              <CodeBlock code={data.originalCode} language={data.language} />
            </div>
          </div>
        )}

        {/* Refactored code panel */}
        <div className="min-w-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
            Refactored
          </p>
          <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-black/[0.08]">
            <CodeBlock code={data.updatedCode} language={data.language} />
          </div>
        </div>
      </div>
    </div>
  );
}
