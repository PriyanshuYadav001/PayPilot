import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CustomerPaymentPage } from './pages/customer/PaymentPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

// Public, account-less customer payment page at /pay/:token. Everything else
// renders the authenticated PayPilot app.
const isCustomerPaymentPage = window.location.pathname.startsWith('/pay/');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isCustomerPaymentPage ? <CustomerPaymentPage /> : <App />}
  </React.StrictMode>
);
