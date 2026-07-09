export type KnowledgeStatus = "known" | "partial" | "unknown";

export interface StandardChatData {
  text: string;
  isMemorySaved: boolean;
  suggestedFollowUps: string[];
}

export interface CodeInspectorData {
  summary: string;
  originalCode: string;
  updatedCode: string;
  language: string;
  improvements: string[];
}

export interface KnowledgeCheckData {
  topic: string;
  confidenceScore: number;
  status: string;
  explanation: string;
  relatedMemoriesCount: number;
}

export type GenerativeComponent =
  | { component: "STANDARD_CHAT"; data: StandardChatData }
  | { component: "CODE_INSPECTOR"; data: CodeInspectorData }
  | { component: "KNOWLEDGE_CHECK"; data: KnowledgeCheckData };

export interface GenerativeUIRouterProps {
  genUI: GenerativeComponent;
  fallbackContent: string;
  onFollowUp?: (prompt: string) => void;
}
