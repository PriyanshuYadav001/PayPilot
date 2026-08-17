/**
 * Call provider abstraction — extends the communication-level ICallProvider
 * with status polling and recording retrieval needed for the call follow-up system.
 *
 * Concrete providers (Twilio, Exotel, etc.) implement this interface.
 * The provider is registered at startup and can be swapped without changing
 * business logic.
 */

export type CallProviderStatus =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'busy'
  | 'no_answer'
  | 'failed';

export interface InitiateCallRequest {
  to: string;
  from?: string;
  scriptText?: string;
  recordCall?: boolean;
  callbackUrl?: string;
  metadata?: Record<string, string>;
}

export interface InitiateCallResponse {
  providerCallId: string;
  status: CallProviderStatus;
  timestamp: Date;
}

export interface CallStatusResult {
  providerCallId: string;
  status: CallProviderStatus;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
}

export interface CallRecordingResult {
  providerCallId: string;
  recordingUrl: string;
  durationSeconds: number;
  transcript?: string;
}

export interface ICallProvider {
  /** Initiate an outbound call */
  initiateCall(request: InitiateCallRequest): Promise<InitiateCallResponse>;

  /** Poll current call status from the provider */
  getCallStatus(providerCallId: string): Promise<CallStatusResult>;

  /** Retrieve call recording + transcript after completion */
  getCallRecording(providerCallId: string): Promise<CallRecordingResult | null>;
}

// ─── Provider Registry ─────────────────────────────────────────────────────

let providerInstance: ICallProvider | null = null;

export function registerCallProvider(provider: ICallProvider): void {
  providerInstance = provider;
}

export function getCallProvider(): ICallProvider {
  if (!providerInstance) {
    throw new Error('No call provider configured. Call registerCallProvider() at startup.');
  }
  return providerInstance;
}

export function clearCallProvider(): void {
  providerInstance = null;
}
