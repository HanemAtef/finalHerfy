import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaPhone,
  FaEllipsisV,
  FaPaperPlane,
  FaPlus,
  FaImage,
  FaMicrophone,
  FaStop,
  FaShieldAlt,
  FaLock,
  FaTrash,
  FaFlag,
} from 'react-icons/fa';
import { connectSocket, getSocket } from '../../socket/socket';
import { messageService, uploadService, reportService } from '../../services/api';
import { fetchOrderById } from '../../store/slices/orderSlice';
import { formatTime, getDefaultAvatar } from '../../utils/helpers';
import ReasonModal from '../../components/common/ReasonModal';

const QUICK_REPLIES = [
  'متاح الآن',
  'كم التكلفة المتوقعة؟',
  'أرسل لي الموقع',
  'شكراً لك',
];

// Mirrors the backend's chat business rule (messageController.js /
// chatSocket.js) — chat only stays open while the order is still active.
const CHAT_OPEN_STATUSES = ['pending', 'accepted', 'price_confirmed', 'in-progress'];

export default function ChatPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);
  const { currentOrder } = useSelector((state) => state.orders);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (orderId) dispatch(fetchOrderById(orderId));
  }, [dispatch, orderId]);

  useEffect(() => {
    if (!orderId) return;
    messageService.getMessages(orderId).then((res) => {
      setMessages(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, [orderId]);

  useEffect(() => {
    if (!orderId || !token) return;

    // connectSocket() is idempotent (returns the existing socket if already
    // connected). We call it here too — instead of relying solely on
    // AuthInit's useSocket() — because React fires child effects before
    // parent effects. On a hard reload of /chat/:orderId this effect used to
    // run before AuthInit's useSocket() had called connectSocket(), so
    // getSocket() returned null, the room was never joined, and
    // 'receiveMessage' was never listened for — real-time chat silently
    // never worked.
    const socket = connectSocket(token);

    // Join immediately and again after every reconnect. A Socket.IO room is
    // tied to one connection, so it is lost if the browser briefly reconnects.
    const joinRoom = () => {
      socket.emit('joinRoom', orderId, (result) => {
        if (!result?.ok) console.error('Unable to join chat room:', result?.error);
      });
    };

    joinRoom();
    socket.on('connect', joinRoom);

    socket.on('receiveMessage', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('messageDeleted', ({ _id }) => {
      setMessages((prev) => prev.map((m) => (m._id === _id ? { ...m, deleted: true, text: '', mediaUrl: null } : m)));
    });

    socket.on('typing', () => setTyping(true));

    return () => {
      socket.off('receiveMessage');
      socket.off('messageDeleted');
      socket.off('typing');
      socket.off('connect', joinRoom);
    };
  }, [orderId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isChatOpen = !currentOrder || CHAT_OPEN_STATUSES.includes(currentOrder.status);

  const sendMessage = (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed || !orderId || !isChatOpen) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('sendMessage', { orderId, text: trimmed, type: 'text' });
    } else {
      messageService.sendMessage({ orderId, text: trimmed, type: 'text' }).then((res) => {
        setMessages((prev) => [...prev, res.data.data]);
      });
    }
    setText('');
    setTyping(false);
  };

  const sendMedia = (type, mediaUrl) => {
    if (!orderId || !isChatOpen) return;
    const socket = getSocket();
    if (socket) {
      socket.emit('sendMessage', { orderId, type, mediaUrl });
    } else {
      messageService.sendMessage({ orderId, type, mediaUrl }).then((res) => {
        setMessages((prev) => [...prev, res.data.data]);
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(text);
  };

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadService.uploadImage(file);
      sendMedia('image', res.data.url);
    } catch {
      // upload failed — surfaced to the user via the disabled state resetting
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setUploading(true);
        try {
          const res = await uploadService.uploadAudio(file);
          sendMedia('audio', res.data.url);
        } catch {
          // ignore — user can just try recording again
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      // microphone permission denied or unavailable — silently no-op
    }
  };

  const handleDeleteMessage = (msg) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('deleteMessage', msg._id);
    }
    messageService.deleteMessage(msg._id).catch(() => {});
    setMessages((prev) => prev.map((m) => (m._id === msg._id ? { ...m, deleted: true, text: '', mediaUrl: null } : m)));
  };

  const handleDeleteConversation = async () => {
    if (!window.confirm('هل تريد حذف كل رسائل هذه المحادثة؟')) return;
    await messageService.deleteConversation(orderId);
    setMessages((prev) => prev.map((m) => ({ ...m, deleted: true, text: '', mediaUrl: null })));
    setMenuOpen(false);
  };

  const handleReport = async (reason) => {
    await reportService.fileReport(orderId, { reason });
    setReportOpen(false);
  };

  const isOwn = (msg) =>
    msg.sender?._id === user?._id || msg.sender === user?._id;

  // Show the real other party (customer <-> handyman) instead of a
  // hardcoded name, based on which side of the order the current user is on.
  const otherParty =
    user?._id === currentOrder?.customerId?._id
      ? currentOrder?.handymanId
      : currentOrder?.customerId;
  const otherName = otherParty?.name || 'المحادثة';

  return (
    <div className="flex h-screen flex-col bg-neutral">
      <header className="flex items-center justify-between border-b border-borderGray bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="text-primary">
            <FaArrowRight size={18} />
          </button>
          <div className="relative">
            <img
              src={otherParty?.profileImage || getDefaultAvatar(otherName)}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
            {isChatOpen && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-tertiary" />
            )}
          </div>
          <div>
            <p className="font-bold text-primary">{otherName}</p>
            <p className="text-xs text-tertiary">
              {!isChatOpen ? 'المحادثة مغلقة' : typing ? 'يكتب...' : 'متصل الآن'}
            </p>
          </div>
        </div>
        <div className="relative flex gap-3 text-primary">
          {otherParty?.phone && (
            <a href={`tel:${otherParty.phone}`}><FaPhone /></a>
          )}
          <button type="button" onClick={() => setMenuOpen((v) => !v)}>
            <FaEllipsisV />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-8 z-10 w-48 rounded-xl border border-borderGray bg-white py-2 text-sm shadow-lg">
              <button
                type="button"
                onClick={() => { setReportOpen(true); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-right text-emergency hover:bg-neutral"
              >
                <FaFlag size={12} /> الإبلاغ عن مشكلة
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                className="flex w-full items-center gap-2 px-4 py-2 text-right text-textGray hover:bg-neutral"
              >
                <FaTrash size={12} /> حذف المحادثة
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="text-center">
          <span className="rounded-full bg-white px-4 py-1 text-xs text-textGray shadow-sm">اليوم</span>
        </div>

        {messages.map((msg) => {
          const own = isOwn(msg);
          return (
            <div key={msg._id} className={`group flex ${own ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] ${own ? 'items-start' : 'items-end'} flex flex-col`}>
                <div className="flex items-center gap-1">
                  {own && !msg.deleted && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 text-textGray hover:text-emergency"
                      title="حذف الرسالة"
                    >
                      <FaTrash size={11} />
                    </button>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      own
                        ? 'rounded-tr-sm bg-primary text-white'
                        : 'rounded-tl-sm border border-borderGray bg-white text-textDark'
                    }`}
                  >
                    {msg.deleted ? (
                      <span className="italic opacity-70">تم حذف هذه الرسالة</span>
                    ) : msg.type === 'image' ? (
                      <img src={msg.mediaUrl} alt="" className="max-h-60 rounded-lg object-cover" />
                    ) : msg.type === 'audio' ? (
                      <audio controls src={msg.mediaUrl} className="max-w-[220px]" />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
                <span className="mt-1 text-xs text-textGray">{formatTime(msg.createdAt || new Date())}</span>
              </div>
            </div>
          );
        })}

        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-xl border border-tertiary/30 bg-tertiary/5 px-4 py-2 text-xs text-tertiary">
            <FaShieldAlt />
            هذا الحرفي موثق من Harfey. معلوماتك ومعاملاتك محمية وآمنة.
          </div>
        </div>

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-borderGray bg-white px-4 py-2">
        {!isChatOpen ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-textGray">
            <FaLock /> المحادثة مغلقة لأن هذا الطلب {
              currentOrder?.status === 'completed' ? 'مكتمل'
                : currentOrder?.status === 'disputed' ? 'قيد مراجعة بلاغ'
                : 'ملغي'
            }
          </div>
        ) : (
          <>
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendMessage(reply)}
                  className="shrink-0 rounded-full border border-borderGray px-3 py-1 text-xs text-primary hover:bg-neutral"
                >
                  {reply}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full p-2 text-textGray disabled:opacity-50"
                title="إرسال صورة"
              >
                <FaImage />
              </button>
              <button
                type="button"
                onClick={toggleRecording}
                disabled={uploading}
                className={`rounded-full p-2 disabled:opacity-50 ${recording ? 'text-emergency' : 'text-textGray'}`}
                title={recording ? 'إيقاف التسجيل' : 'رسالة صوتية'}
              >
                {recording ? <FaStop /> : <FaMicrophone />}
              </button>
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  getSocket()?.emit('typing', { orderId });
                }}
                placeholder="اكتب رسالتك..."
                className="input-field flex-1 rounded-full py-2"
              />
              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-white"
              >
                <FaPaperPlane size={14} />
              </button>
            </form>
          </>
        )}
      </div>

      {reportOpen && (
        <ReasonModal
          title="سبب الإبلاغ عن هذا الطلب"
          confirmLabel="إرسال البلاغ"
          danger
          onConfirm={handleReport}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
