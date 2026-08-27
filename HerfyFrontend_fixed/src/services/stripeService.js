import api from '../api/axios';

export const createPaymentIntent = (items) =>
  api.post('/payments/create-payment-intent', { items });

export const createSubscription = (plan) =>
  api.post('/subscriptions/create', { plan });

export const cancelSubscription = (subscriptionId) =>
  api.post('/subscriptions/cancel', { subscriptionId });
