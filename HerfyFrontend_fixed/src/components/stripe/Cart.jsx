import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from './CheckoutForm';
import { createPaymentIntent } from '../../services/stripeService';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Mirror of the server-side PRODUCT_CATALOG — only IDs and display info here,
// prices are always calculated server-side.
const PRODUCTS = [
  { id: 'prod_basic_service',   name: 'Basic Service',   displayPrice: '$29.99' },
  { id: 'prod_premium_service', name: 'Premium Service', displayPrice: '$79.99' },
];

export default function Cart() {
  const [cart, setCart] = useState([]);
  const [clientSecret, setClientSecret] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) =>
    setCart((prev) => prev.filter((i) => i.productId !== productId));

  const handleCheckout = async () => {
    if (!cart.length) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await createPaymentIntent(cart);
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  if (clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <h2 className="text-xl font-semibold text-center mb-4">Complete Payment</h2>
        <CheckoutForm orderId={null} amount={null} />
      </Elements>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">Products</h2>
      <div className="space-y-2 mb-6">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="flex justify-between items-center border p-3 rounded">
            <span>{p.name} — {p.displayPrice}</span>
            <button
              onClick={() => addToCart(p)}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
            >
              Add
            </button>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <>
          <h3 className="font-semibold mb-2">Cart</h3>
          <ul className="mb-4 space-y-1">
            {cart.map((item) => (
              <li key={item.productId} className="flex justify-between text-sm">
                <span>{item.name} × {item.quantity}</span>
                <button onClick={() => removeFromCart(item.productId)} className="text-red-500">
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Proceed to Payment'}
          </button>
        </>
      )}
    </div>
  );
}
