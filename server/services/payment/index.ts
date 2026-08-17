import type { IPaymentProvider } from './PaymentProvider';
import { PaymentError, PaymentProviderError } from './PaymentProvider';
import { RazorpayProvider } from './RazorpayProvider';

const providers: Record<string, () => IPaymentProvider> = {
  razorpay: () => new RazorpayProvider(),
};

export function getPaymentProvider(name = 'razorpay'): IPaymentProvider {
  const factory = providers[name.toLowerCase()];
  if (!factory) {
    throw new PaymentError(
      `Unsupported payment provider "${name}".`,
      'PAYMENT_PROVIDER_UNSUPPORTED',
      400
    );
  }
  return factory();
}

export { PaymentError, PaymentProviderError };

