"use client";

import { Brain } from "lucide-react";
import type { StandardChatData } from "./types";
import { MarkdownRenderer } from "@/src/components/shared/MarkdownRenderer";
import { SuggestedFollowUps } from "./SuggestedFollowUps";

export function StandardChatBlock({
  data,
  onFollowUp,
}: {
  data: StandardChatData;
  onFollowUp?: (prompt: string) => void;
}) {
  return (
    <div className="min-w-0">
      {data.isMemorySaved && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
          <Brain className="h-3 w-3" aria-hidden="true" />
          Saved to memory
        </div>
      )}

      <MarkdownRenderer content={data.text} isUser={false} />

      {onFollowUp && data.suggestedFollowUps.length > 0 && (
        <SuggestedFollowUps items={data.suggestedFollowUps} onSelect={onFollowUp} />
      )}
    </div>
  );
}
