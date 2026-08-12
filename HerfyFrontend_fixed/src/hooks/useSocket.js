import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { connectSocket, disconnectSocket, getSocket, getSocketInstanceId } from '../socket/socket';
import { addNotification, setUnreadCount, fetchUnreadCount } from '../store/slices/notificationSlice';

export default function useSocket() {
  const dispatch = useDispatch();
  const { token, user, isAuthenticated } = useSelector((state) => state.auth);

  useEffect(() => {
    if (!isAuthenticated || !token || !user?._id) return;

    const socket = connectSocket(token);

    socket.emit('join-user-room', user._id);
    socket.emit('get-unread-count', user._id);
    dispatch(fetchUnreadCount());

    socket.on('new-notification', (notification) => {
      dispatch(addNotification(notification));
    });

    socket.on('unread-count', ({ count }) => {
      dispatch(setUnreadCount(count));
    });

    return () => {
      console.log('[SOCKET AUDIT] useSocket cleanup', {
        socketInstanceId: getSocketInstanceId(),
        userId: user?._id,
      });
      socket.off('new-notification');
      socket.off('unread-count');
      disconnectSocket();
    };
  }, [isAuthenticated, token, user?._id, dispatch]);

  return getSocket();
}
