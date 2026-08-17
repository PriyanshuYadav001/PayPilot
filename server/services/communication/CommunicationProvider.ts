/**
 * Shared types and errors for the unified communication architecture.
 *
 * Every channel (email / whatsapp / call) is dispatched through a clean
 * provider interface and the outcome is persisted in the `communications`
 * table. Channels are intentionally limited to the supported set here; the
 * database enum retains `sms` for future use.
 */

export type CommunicationChannel = 'email' | 'whatsapp' | 'call';
export type CommunicationDirection = 'outbound' | 'inbound';

export type CommunicationStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'replied'
  | 'failed'
  | 'bounced';

export class CommunicationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'CommunicationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Normalised outcome returned by any channel provider after a message is
 * dispatched. `providerMessageId` is the provider's reference and doubles as
 * the idempotency key in the `communications` table.
 */
export interface ProviderDispatchResult {
  providerMessageId: string;
  status: 'queued' | 'sent' | 'failed';
  timestamp: Date;
  /**
   * The provider's own status verbatim (e.g. `ringing`, `no-answer`,
   * `accepted`). Persisted in the communication metadata for fidelity.
   */
  rawStatus?: string;
}
