"use client";

import type { CSSProperties } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyButton } from "./CopyButton";

const syntaxHighlighterStyle = oneLight as Record<string, CSSProperties>;

export function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="code-block my-4 max-w-full overflow-hidden rounded-xl border border-black/[0.08]">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-black/[0.07] bg-[#f8f7f4] px-3 py-2">
        <span className="min-w-0 truncate font-mono text-xs text-[#6b6b6b]">{language}</span>
        <CopyButton code={code} />
      </div>
      <SyntaxHighlighter
        style={syntaxHighlighterStyle}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          background: "#ffffff",
          padding: "1rem",
          maxWidth: "100%",
        }}
        wrapLines
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
