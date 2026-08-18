import type {
  ICallProvider,
  InitiateCallRequest,
  InitiateCallResponse,
  CallStatusResult,
  CallRecordingResult,
  CallProviderStatus,
} from '../CallProvider';

export class ExotelProvider implements ICallProvider {
  private readonly apiKey: string;
  private readonly apiToken: string;
  private readonly accountSid: string;
  private readonly fromNumber: string;

  constructor() {
    this.apiKey = process.env.EXOTEL_API_KEY ?? '';
    this.apiToken = process.env.EXOTEL_API_TOKEN ?? '';
    this.accountSid = process.env.EXOTEL_ACCOUNT_SID ?? '';
    this.fromNumber = process.env.EXOTEL_CALL_PHONE_NUMBER ?? '';

    if (!this.apiKey || !this.apiToken || !this.accountSid) {
      throw new Error(
        'Exotel credentials are not configured. Set EXOTEL_API_KEY, EXOTEL_API_TOKEN and EXOTEL_ACCOUNT_SID.',
      );
    }

    if (!this.fromNumber) {
      throw new Error(
        'EXOTEL_CALL_PHONE_NUMBER is not configured.',
      );
    }
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(
      `${this.apiKey}:${this.apiToken}`,
    ).toString('base64')}`;
  }

  async initiateCall(
    request: InitiateCallRequest,
  ): Promise<InitiateCallResponse> {
    const to = request.to;
    const from = request.from ?? this.fromNumber;

    const response = await fetch(
      `https://api.exotel.com/v1/Accounts/${this.accountSid}/Calls/connect`,
      {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: from,
          To: to,
          CallerId: from,
          ...(request.callbackUrl
            ? { CallType: 'trans' }
            : {}),
          ...(request.recordCall ? { Record: 'true' } : {}),
        }).toString(),
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Exotel API error (${response.status}): ${responseText}`,
      );
    }

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Exotel returned an invalid response: ${responseText}`,
      );
    }

    const call = data?.Call ?? data?.call ?? data;

    const providerCallId =
      call?.Sid ??
      call?.sid ??
      call?.CallSid ??
      call?.call_sid;

    if (!providerCallId) {
      throw new Error(
        'Exotel did not return a provider call ID.',
      );
    }

    return {
      providerCallId: String(providerCallId),
      status: this.mapStatus(
        call?.Status ?? call?.status ?? 'queued',
      ),
      timestamp: new Date(),
    };
  }

  async getCallStatus(
    providerCallId: string,
  ): Promise<CallStatusResult> {
    const response = await fetch(
      `https://api.exotel.com/v1/Accounts/${this.accountSid}/Calls/${encodeURIComponent(providerCallId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: 'application/json',
        },
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Exotel status API error (${response.status}): ${responseText}`,
      );
    }

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Exotel returned an invalid status response: ${responseText}`,
      );
    }

    const call = data?.Call ?? data?.call ?? data;

    return {
      providerCallId,
      status: this.mapStatus(
        call?.Status ?? call?.status ?? 'queued',
      ),
      startedAt: this.parseDate(
        call?.StartTime ?? call?.start_time,
      ),
      endedAt: this.parseDate(
        call?.EndTime ?? call?.end_time,
      ),
      durationSeconds: this.parseDuration(
        call?.Duration ?? call?.duration,
      ),
    };
  }

  async getCallRecording(
    providerCallId: string,
  ): Promise<CallRecordingResult | null> {
    const response = await fetch(
      `https://api.exotel.com/v1/Accounts/${this.accountSid}/Calls/${encodeURIComponent(providerCallId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const responseText = await response.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      return null;
    }

    const call = data?.Call ?? data?.call ?? data;

    const recordingUrl =
      call?.RecordingUrl ??
      call?.recording_url ??
      call?.RecordingURL ??
      null;

    if (!recordingUrl) {
      return null;
    }

    return {
      providerCallId,
      recordingUrl: String(recordingUrl),
      durationSeconds:
        this.parseDuration(
          call?.Duration ?? call?.duration,
        ) ?? 0,
    };
  }

  private mapStatus(status: unknown): CallProviderStatus {
    const value = String(status ?? '').toLowerCase();

    switch (value) {
      case 'queued':
      case 'pending':
        return 'queued';

      case 'ringing':
      case 'calling':
        return 'ringing';

      case 'in-progress':
      case 'in_progress':
      case 'inprogress':
        return 'in_progress';

      case 'completed':
      case 'complete':
      case 'answered':
        return 'completed';

      case 'busy':
        return 'busy';

      case 'no-answer':
      case 'no_answer':
      case 'noanswer':
        return 'no_answer';

      case 'failed':
      case 'failure':
      case 'cancelled':
      case 'canceled':
        return 'failed';

      default:
        return 'queued';
    }
  }

  private parseDate(value: unknown): Date | undefined {
    if (!value) return undefined;

    const date = new Date(String(value));

    return Number.isNaN(date.getTime())
      ? undefined
      : date;
  }

  private parseDuration(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const duration = Number(value);

    return Number.isFinite(duration)
      ? duration
      : undefined;
  }
}