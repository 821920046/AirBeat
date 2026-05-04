export interface Track {
  id: string;
  title: string;
  author: string;
  date: string;
  filename: string;
  subDir: string;
  size: number;
  url: string;
  bvid?: string;
}

export interface ChatMessage {
  id: string;
  role: "agent" | "operator" | "system" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
}

export interface PlayerState {
  current: Track | null;
  playlist: Track[];
  index: number;
  playing: boolean;
  progress: number;
  duration: number;
  volume: number;
}

export interface AgentState {
  messages: ChatMessage[];
  loading: boolean;
  sessionId: string | null;
}
