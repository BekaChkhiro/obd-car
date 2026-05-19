export type MessageRole = 'user' | 'assistant';
export type ToolStatus = 'pending' | 'running' | 'done' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: ToolStatus;
  result?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  createdAt: string;
}
