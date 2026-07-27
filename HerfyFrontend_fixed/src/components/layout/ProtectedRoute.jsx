import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoadingSpinner from '../common/LoadingSpinner';
import { getEffectiveRole } from '../../utils/helpers';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isAuthenticated, user, isLoading } = useSelector((state) => state.auth);
  const location = useLocation();

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admins don't have role: "admin" in the DB — it's a separate `isAdmin`
  // flag on top of their customer/handyman role (see helpers.js). Reading
  // user.role directly here would mean allowedRoles={['admin']} never
  // matches, and every admin gets silently redirected into the customer or
  // handyman dashboard instead of the admin panel.
  const effectiveRole = getEffectiveRole(user);

  if (allowedRoles.length && !allowedRoles.includes(effectiveRole)) {
    const redirectMap = {
      customer: '/customer/home',
      handyman: '/handyman/dashboard',
      admin: '/admin/dashboard',
    };
    return <Navigate to={redirectMap[effectiveRole] || '/'} replace />;
  }

  return children;
}
