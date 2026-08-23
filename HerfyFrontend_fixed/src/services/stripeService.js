import api from '../api/axios';

export const createPaymentIntent = (items) =>
  api.post('/payments/create-payment-intent', { items });

export const createSubscription = (plan, paymentMethodId) =>
  api.post('/subscriptions/create', { plan, paymentMethodId });

export const cancelSubscription = (subscriptionId) =>
  api.post('/subscriptions/cancel', { subscriptionId });
