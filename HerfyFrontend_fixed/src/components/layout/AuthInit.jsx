import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getMe } from '../../store/slices/authSlice';
import { fetchCurrentLocation } from '../../store/slices/locationSlice';
import useSocket from '../../hooks/useSocket';
import LoadingSpinner from '../common/LoadingSpinner';
import { getEffectiveRole } from '../../utils/helpers';

export default function AuthInit({ children }) {
  const dispatch = useDispatch();
  const { token, user, isLoading } = useSelector((state) => state.auth);
  const locationStatus = useSelector((state) => state.location.status);

  useSocket();

  useEffect(() => {
    if (token && !user) {
      dispatch(getMe());
    }
  }, [dispatch, token, user]);

  // Fetch location exactly once per session, right after we know who's
  // logged in — not on every page mount. Only customers need it (finding
  // nearby handymen); the handyman/admin apps don't.
  useEffect(() => {
    if (user && getEffectiveRole(user) === 'customer' && locationStatus === 'idle') {
      dispatch(fetchCurrentLocation());
    }
  }, [dispatch, user, locationStatus]);

  if (token && !user && isLoading) {
    return <LoadingSpinner fullScreen text="جاري تحميل حسابك..." />;
  }

  return children;
}
