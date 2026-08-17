/**
 * Razorpay Checkout SDK integration for the customer payment page.
 *
 * The checkout window is the real payment system: the server creates the order
 * (amount resolved server-side), the customer pays Razorpay directly, and the
 * invoice is only ever reconciled by the payment webhook. Nothing on this page
 * ever marks a payment successful.
 */

export interface RazorpayCheckoutInput {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  businessName: string;
  prefill?: { name?: string; email?: string };
}

export interface RazorpayCheckoutResponse {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  prefill?: { name?: string; email?: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', callback: () => void) => void;
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const CHECKOUT_SOURCE = 'https://checkout.razorpay.com/v1/checkout.js';

export function loadRazorpayCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }

    const existing = document.getElementById('razorpay-checkout-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout.')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = CHECKOUT_SOURCE;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout.'));
    document.head.appendChild(script);
  });
}

export function openRazorpayCheckout(input: RazorpayCheckoutInput): Promise<RazorpayCheckoutResponse> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay checkout is not available.'));
      return;
    }

    const razorpay = new window.Razorpay({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amountPaise,
      currency: input.currency,
      name: input.businessName,
      prefill: input.prefill,
      theme: { color: '#10b981' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(new Error('Payment window closed.')) },
    });

    razorpay.on('payment.failed', () => reject(new Error('Payment failed.')));
    razorpay.open();
  });
}
