import { Link } from 'react-router-dom';

export default function PaymentCancel() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-yellow-600">Payment Canceled</h1>
      <p className="text-gray-600">Your payment was not completed.</p>
      <Link to="/customer/home" className="text-blue-600 underline">Back to Home</Link>
    </div>
  );
}
