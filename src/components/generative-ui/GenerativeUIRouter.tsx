"use client";

import type { GenerativeUIRouterProps } from "./types";
import { StandardChatBlock } from "./StandardChatBlock";
import { CodeInspectorBlock } from "./CodeInspectorBlock";
import { KnowledgeCheckBlock } from "./KnowledgeCheckBlock";
import { SuggestedFollowUps } from "./SuggestedFollowUps";
import { MarkdownRenderer } from "@/src/components/shared/MarkdownRenderer";

export function GenerativeUIRouter({ genUI, fallbackContent, onFollowUp }: GenerativeUIRouterProps) {
  try {
    switch (genUI.component) {
      case "STANDARD_CHAT":
        return <StandardChatBlock data={genUI.data} onFollowUp={onFollowUp} />;

      case "CODE_INSPECTOR":
        return (
          <>
            <CodeInspectorBlock data={genUI.data} />
            {onFollowUp && (
              <SuggestedFollowUps
                items={["Save this review", "Explain more"]}
                onSelect={onFollowUp}
              />
            )}
          </>
        );

      case "KNOWLEDGE_CHECK":
        return <KnowledgeCheckBlock data={genUI.data} />;

      default:
        return <MarkdownRenderer content={fallbackContent} isUser={false} />;
    }
  } catch {
    return <MarkdownRenderer content={fallbackContent} isUser={false} />;
  }
}
