import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomerPaymentPage } from '../../client/src/pages/customer/PaymentPage';

const m = vi.hoisted(() => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
    }
  }
  return {
    ApiError,
    getPublicPaymentPage: vi.fn(),
    createPublicCheckout: vi.fn(),
    loadRazorpayCheckoutScript: vi.fn(),
    openRazorpayCheckout: vi.fn(),
  };
});

vi.mock('../../client/src/lib/publicPayments', () => ({
  ApiError: m.ApiError,
  getPublicPaymentPage: m.getPublicPaymentPage,
  createPublicCheckout: m.createPublicCheckout,
}));

vi.mock('../../client/src/lib/razorpayCheckout', () => ({
  loadRazorpayCheckoutScript: m.loadRazorpayCheckoutScript,
  openRazorpayCheckout: m.openRazorpayCheckout,
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,fake-qr'),
}));

const TOKEN = '123e4567-e89b-42d3-a456-426614174050';

const PAGE = {
  token: TOKEN,
  businessName: 'Globex Ltd',
  invoiceNumber: 'INV-2026-001',
  issueDate: '2026-08-01',
  dueDate: '2099-12-31',
  currency: 'INR',
  totalAmount: 2760,
  amountPaid: 0,
  amountDue: 2760,
  payableAmount: 2760,
  invoiceStatus: 'sent',
  paymentStatus: 'open',
  paymentLinkUrl: 'https://rzp.io/pay/abc123',
  customerName: 'Jane Doe',
  customerEmail: 'jane@globex.com',
  providerConfigured: true,
};

describe('Customer Payment Page (/pay/:token)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getPublicPaymentPage.mockReset();
    m.createPublicCheckout.mockReset();
    m.loadRazorpayCheckoutScript.mockReset();
    m.openRazorpayCheckout.mockReset();
    window.history.pushState({}, '', `/pay/${TOKEN}`);
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the invoice summary and payment options without an account', async () => {
    m.getPublicPaymentPage.mockResolvedValue(PAGE);
    render(<CustomerPaymentPage />);

    expect(await screen.findByText('Globex Ltd')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Payment Open')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount due')).toHaveTextContent('2,760.00');
    expect(screen.getByRole('button', { name: /Pay Now/ })).toBeInTheDocument();
    expect(screen.getByAltText('Payment QR code')).toHaveAttribute('src', 'data:image/png;base64,fake-qr');
  });

  it('shows a friendly error when the link is unknown', async () => {
    m.getPublicPaymentPage.mockRejectedValue(
      new m.ApiError('PAYMENT_LINK_NOT_FOUND', 'Payment link not found or no longer available.')
    );
    render(<CustomerPaymentPage />);

    expect(await screen.findByText('Unable to load this payment')).toBeInTheDocument();
    expect(screen.getByText(/Payment link not found/)).toBeInTheDocument();
  });

  it('shows an invalid-link message when no token is present', async () => {
    window.history.pushState({}, '', '/');
    render(<CustomerPaymentPage />);

    expect(await screen.findByText('Invalid payment link')).toBeInTheDocument();
  });

  it('reflects a server-reported paid invoice and hides Pay Now', async () => {
    m.getPublicPaymentPage.mockResolvedValue({ ...PAGE, paymentStatus: 'paid' });
    render(<CustomerPaymentPage />);

    expect(await screen.findByText(/paid in full/i)).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay Now/ })).not.toBeInTheDocument();
  });

  it('does not offer Pay Now when the provider is not configured', async () => {
    m.getPublicPaymentPage.mockResolvedValue({ ...PAGE, providerConfigured: false });
    render(<CustomerPaymentPage />);

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay Now/ })).not.toBeInTheDocument();
  });

  it('connects Pay Now to the real payment system with the server-side order', async () => {
    m.getPublicPaymentPage.mockResolvedValueOnce(PAGE).mockResolvedValue({ ...PAGE, paymentStatus: 'paid' });
    m.createPublicCheckout.mockResolvedValue({
      keyId: 'rzp_live_test_key',
      orderId: 'order_pub_1',
      amountPaise: 276000,
      currency: 'INR',
      businessName: 'Globex Ltd',
      prefill: { name: 'Jane Doe', email: 'jane@globex.com' },
    });
    m.loadRazorpayCheckoutScript.mockResolvedValue(undefined);
    m.openRazorpayCheckout.mockResolvedValue({ razorpay_payment_id: 'pay_xyz' });

    render(<CustomerPaymentPage />);
    await screen.findByText('Globex Ltd');

    fireEvent.click(screen.getByRole('button', { name: /Pay Now/ }));

    await waitFor(() => expect(m.createPublicCheckout).toHaveBeenCalledWith(TOKEN));
    expect(m.openRazorpayCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order_pub_1', amountPaise: 276000, keyId: 'rzp_live_test_key' })
    );

    // Success is only shown after the server (via the webhook) reports it.
    expect(await screen.findByText(/paid in full/i)).toBeInTheDocument();
  });

  it('does not claim success when the checkout window is dismissed', async () => {
    m.getPublicPaymentPage.mockResolvedValue(PAGE);
    m.createPublicCheckout.mockResolvedValue({
      keyId: 'rzp_live_test_key',
      orderId: 'order_pub_1',
      amountPaise: 276000,
      currency: 'INR',
      businessName: 'Globex Ltd',
      prefill: {},
    });
    m.loadRazorpayCheckoutScript.mockResolvedValue(undefined);
    m.openRazorpayCheckout.mockRejectedValue(new Error('Payment window closed.'));

    render(<CustomerPaymentPage />);
    await screen.findByText('Globex Ltd');

    fireEvent.click(screen.getByRole('button', { name: /Pay Now/ }));
    await waitFor(() => expect(m.openRazorpayCheckout).toHaveBeenCalled());

    // Still ready to retry, and no success message appears.
    expect(await screen.findByRole('button', { name: /Pay Now/ })).toBeInTheDocument();
    expect(screen.queryByText(/paid in full/i)).not.toBeInTheDocument();
  });
});
