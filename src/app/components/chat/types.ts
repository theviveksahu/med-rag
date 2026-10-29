import type { StageData, TraceData } from "@/lib/shared/types";

export interface ToolActivity {
  toolCallId: string;
  name: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export interface MessageActivity {
  stages: StageData[];
  traces: TraceData[];
  tasks: ToolActivity[];
  activeStage?: StageData;
  sections: number;
  analystCount: number;
  hasActivity: boolean;
}
