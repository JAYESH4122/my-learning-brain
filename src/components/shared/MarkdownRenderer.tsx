"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

function createMarkdownComponents(isUser: boolean): Components {
  return {
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || "");
      const codeString = String(children).replace(/\n$/, "");
      const language = match?.[1] ?? "text";
      const isBlock = Boolean(match) || codeString.includes("\n");

      if (isBlock) return <CodeBlock code={codeString} language={language} />;

      return (
        <code
          className={`rounded px-1.5 py-0.5 font-mono text-[0.87em] ${
            isUser ? "bg-white/[0.16] text-white" : "bg-black/[0.06] text-[#0f0f0f]"
          }`}
        >
          {children}
        </code>
      );
    },
    p: ({ children }) => <p className="chat-markdown mb-3 leading-7 last:mb-0">{children}</p>,
    h1: ({ children }) => (
      <h1 className="chat-markdown mb-3 mt-1 text-xl font-bold leading-8 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="chat-markdown mb-2.5 mt-4 text-lg font-bold leading-7 first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="chat-markdown mb-2 mt-3 text-base font-semibold leading-7 first:mt-0">{children}</h3>
    ),
    strong: ({ children }) => (
      <strong className={isUser ? "font-bold text-white" : "font-bold text-[#0f0f0f]"}>{children}</strong>
    ),
    ul: ({ children }) => (
      <ul className="chat-markdown mb-3 ml-5 list-disc space-y-2 leading-7 marker:text-black/40 last:mb-0">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="chat-markdown mb-3 ml-5 list-decimal space-y-2 leading-7 marker:text-black/40 last:mb-0">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={`chat-markdown my-3 rounded-r-xl border-l-2 py-1 pl-3 leading-7 ${
          isUser
            ? "border-white/40 bg-white/[0.08] text-white/90"
            : "border-black/[0.2] bg-black/[0.03] text-[#6b6b6b]"
        }`}
      >
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline decoration-2 underline-offset-4 transition ${
          isUser
            ? "text-white decoration-white/40 hover:decoration-white"
            : "text-[#0f0f0f] decoration-black/30 hover:decoration-black"
        }`}
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-black/[0.08]">
        <table className="w-full min-w-[34rem] table-auto border-collapse bg-white text-left text-sm text-[#0f0f0f]">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="break-words border-b border-black/[0.08] bg-[#f8f7f4] px-3 py-2.5 font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="break-words border-b border-black/[0.06] px-3 py-2.5 align-top">{children}</td>
    ),
  };
}

export function MarkdownRenderer({
  content,
  isUser = false,
}: {
  content: string;
  isUser?: boolean;
}) {
  return (
    <div className={`message-copy min-w-0 text-sm leading-7 ${isUser ? "text-white" : "text-[#0f0f0f]"}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents(isUser)}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
