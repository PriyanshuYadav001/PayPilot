import type { IEmailProvider } from './EmailProvider';
import type { IWhatsAppProvider } from './WhatsAppProvider';
import type { ICallProvider } from './CallProvider';
import { CommunicationChannel, CommunicationError } from './CommunicationProvider';

/**
 * Communication provider registry.
 *
 * Concrete providers are NOT implemented yet — they are wired up (via
 * `registerCommunicationProvider`) once credentials are available, keeping
 * provider-specific code out of routes and services that only depend on the
 * channel interfaces. Until a provider is registered, dispatching on that
 * channel fails with a clear 503.
 */
export type CommunicationProvider = IEmailProvider | IWhatsAppProvider | ICallProvider;

const providerFactories: Partial<Record<CommunicationChannel, () => CommunicationProvider>> = {};

export function registerCommunicationProvider(
  channel: CommunicationChannel,
  factory: () => CommunicationProvider
): void {
  providerFactories[channel] = factory;
}

export function getCommunicationProvider(channel: CommunicationChannel): CommunicationProvider {
  const factory = providerFactories[channel];
  if (!factory) {
    throw new CommunicationError(
      `The ${channel} channel has no provider configured.`,
      'COMMUNICATION_PROVIDER_NOT_CONFIGURED',
      503
    );
  }
  return factory();
}

/**
 * Remove all registered providers — used in tests to restore a clean state.
 */
export function clearCommunicationProviders(): void {
  for (const key of Object.keys(providerFactories) as CommunicationChannel[]) {
    delete providerFactories[key];
  }
}

export { CommunicationError } from './CommunicationProvider';
export type { CommunicationChannel, CommunicationDirection, CommunicationStatus } from './CommunicationProvider';
