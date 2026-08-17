export interface OutboundCallRequest {
  to: string;
  from?: string;
  scriptText?: string;
  audioUrl?: string;
  recordCall?: boolean;
  callbackUrl?: string;
  metadata?: Record<string, string>;
}

export interface OutboundCallResponse {
  providerCallId: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'failed';
  timestamp: Date;
}

export interface ICallProvider {
  initiateOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResponse>;
  fetchCallRecording(providerCallId: string): Promise<{ audioBuffer: Buffer; durationSeconds: number } | null>;
}
