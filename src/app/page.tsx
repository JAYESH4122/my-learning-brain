"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Brain,
  Loader2,
  Trash2,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText: userMessage.content,
          userId: "54ad7274-ddff-4727-9ca0-84097b044c11",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error: ${response.status}`);
      }

      let responseText = "";
      if (data.error) responseText = `Error: ${data.error}`;
      else if (data.response) responseText = data.response;
      else if (data.answer) responseText = data.answer;
      else if (data.message) responseText = data.message;
      else
        responseText = "I received your message. How can I help you further?";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseText,
        role: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700/50 shadow-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="relative group">
                <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg transform group-hover:scale-105 transition-transform duration-200">
                  <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="absolute -inset-1 bg-blue-400/20 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-200 to-blue-400 bg-clip-text text-transparent">
                  Learning Brain
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 hidden sm:flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI-powered knowledge assistant
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {messages.length > 0 && (
                <div className="hidden sm:block text-sm text-slate-400 bg-slate-700/50 px-3 py-1 rounded-lg">
                  {messages.length} message{messages.length !== 1 ? "s" : ""}
                </div>
              )}
              <button
                onClick={clearChat}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-xl transition-all duration-200 border border-slate-600/50 hover:border-blue-500/30 backdrop-blur-sm group"
              >
                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 h-[calc(100vh-80px)] py-4">
        <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 shadow-2xl h-full flex flex-col overflow-hidden">
          {/* Messages Container */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-gradient-to-b from-slate-800/20 to-slate-900/10"
          >
            {messages.length === 0 ? (
              <div className="text-center py-8 sm:py-16 h-full flex flex-col justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl flex items-center justify-center shadow-lg">
                  <Brain className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">
                  Welcome to Learning Brain
                </h2>
                <p className="text-slate-300 max-w-md mx-auto mb-6 sm:mb-8 text-sm sm:text-base leading-relaxed">
                  Start a conversation by sharing knowledge or asking questions.
                </p>
                <div className="mt-6 space-y-3 max-w-sm mx-auto">
                  <div
                    className="text-left p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl backdrop-blur-sm hover:border-blue-500/20 transition-all duration-300 group cursor-pointer"
                    onClick={() =>
                      setInput(
                        "Review this code: function add(a,b) { return a+b }"
                      )
                    }
                  >
                    <p className="text-sm text-slate-300 leading-relaxed group-hover:text-slate-200">
                      <strong className="text-blue-400">Code:</strong> "Review
                      this code: function add..."
                    </p>
                  </div>
                  <div
                    className="text-left p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl backdrop-blur-sm hover:border-blue-500/20 transition-all duration-300 group cursor-pointer"
                    onClick={() =>
                      setInput("What do you know about energy conversion?")
                    }
                  >
                    <p className="text-sm text-slate-300 leading-relaxed group-hover:text-slate-200">
                      <strong className="text-blue-400">Ask:</strong> "What do
                      you know about energy conversion?"
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-blue-500 to-blue-600"
                          : "bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50"
                      }`}
                    >
                      {message.role === "user" ? (
                        <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      )}
                    </div>

                    {/* Message Bubble - WIDTH INCREASED FOR CODE */}
                    <div
                      className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm overflow-hidden ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                          : "bg-slate-700/60 text-slate-100 border border-slate-600/30"
                      }`}
                    >
                      {/* NEW: Markdown Renderer */}
                      <div className="text-sm sm:text-[15px] leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Custom Code Block Renderer
                            code({
                              node,
                              inline,
                              className,
                              children,
                              ...props
                            }: any) {
                              const match = /language-(\w+)/.exec(
                                className || ""
                              );
                              const codeString = String(children).replace(
                                /\n$/,
                                ""
                              );

                              if (!inline && match) {
                                return (
                                  <div className="relative my-4 rounded-lg overflow-hidden border border-slate-600/50 bg-[#1e1e1e]">
                                    <div className="flex items-center justify-between px-3 py-2 bg-[#2d2d2d] border-b border-slate-600/50">
                                      <span className="text-xs text-slate-400 font-mono">
                                        {match[1]}
                                      </span>
                                      <CopyButton code={codeString} />
                                    </div>
                                    <SyntaxHighlighter
                                      style={vscDarkPlus}
                                      language={match[1]}
                                      PreTag="div"
                                      className="!my-0 !bg-[#1e1e1e] !p-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
                                      showLineNumbers={true}
                                      wrapLines={true}
                                      {...props}
                                    >
                                      {codeString}
                                    </SyntaxHighlighter>
                                  </div>
                                );
                              }
                              // Inline Code (e.g. `variable`)
                              return (
                                <code
                                  className={`${
                                    message.role === "user"
                                      ? "bg-blue-700 text-white"
                                      : "bg-slate-800 text-blue-200"
                                  } px-1.5 py-0.5 rounded font-mono text-sm`}
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                            // Paragraph styling
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0">{children}</p>
                            ),
                            // List styling
                            ul: ({ children }) => (
                              <ul className="list-disc ml-4 mb-2 space-y-1">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal ml-4 mb-2 space-y-1">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="mb-0.5">{children}</li>
                            ),
                            // Link styling
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-300 hover:underline"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>

                      {/* Timestamp */}
                      <div
                        className={`text-xs mt-2 font-medium flex items-center gap-2 ${
                          message.role === "user"
                            ? "text-blue-200/80"
                            : "text-slate-400"
                        }`}
                      >
                        <span>{formatTime(message.timestamp)}</span>
                        {message.role === "assistant" && (
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center shadow-lg">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="bg-slate-700/60 text-slate-100 rounded-2xl px-4 py-3 border border-slate-600/30 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                    <span className="text-sm text-slate-300">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="bg-red-900/30 text-red-300 rounded-2xl px-4 py-3 border border-red-700/50 shadow-lg backdrop-blur-sm max-w-[85%] sm:max-w-[75%]">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Something went wrong
                      </p>
                      <p className="text-xs mt-1 opacity-90">{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <div className="border-t border-slate-700/30 p-4 sm:p-6 bg-slate-800/40 backdrop-blur-md">
            <form onSubmit={handleSubmit} className="flex gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Share knowledge or ask a question..."
                  className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-700/50 border border-slate-600/30 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all duration-300 backdrop-blur-sm shadow-lg text-sm sm:text-base"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                {!input && (
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <span className="text-xs text-slate-500 bg-slate-600/30 px-2 py-1 rounded-lg hidden sm:block">
                      Press Enter to send
                    </span>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center gap-2 font-medium shadow-lg hover:shadow-blue-500/20 disabled:hover:shadow-none group min-w-[80px] sm:min-w-[100px] justify-center"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-0.5 transition-transform" />
                )}
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
            <p className="text-xs text-slate-500 mt-3 text-center flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
              Your knowledge is stored securely and improves responses over time
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// Helper Component for the Copy Button
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <button
      onClick={copyToClipboard}
      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all flex items-center gap-1.5"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span className="text-xs">Copy</span>
        </>
      )}
    </button>
  );
}
