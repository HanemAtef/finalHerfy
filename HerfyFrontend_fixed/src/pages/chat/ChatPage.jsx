import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaPhone,
  FaEllipsisV,
  FaPaperPlane,
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

const CHAT_OPEN_STATUSES = ['pending', 'accepted', 'price_confirmed', 'in-progress', 'arrived'];

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

    const socket = connectSocket(token);

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
      // upload failed
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
          // ignore
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      // mic error
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

  const otherParty =
    user?._id === currentOrder?.customerId?._id
      ? currentOrder?.handymanId
      : currentOrder?.customerId;
  const otherName = otherParty?.name || 'المحادثة';

  return (
    <div className="flex h-screen flex-col bg-[#F3F5F7]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral bg-white px-5 py-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral text-textGray hover:text-primary transition-colors"
          >
            <FaArrowRight size={13} />
          </button>
          <div className="relative">
            <img
              src={otherParty?.profileImage || getDefaultAvatar(otherName)}
              alt=""
              className="h-10 w-10 rounded-2xl object-cover border border-neutral shadow-2xs"
            />
            {isChatOpen && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-tertiary" />
            )}
          </div>
          <div>
            <p className="font-bold text-textDark text-sm">{otherName}</p>
            <p className="text-[11px] text-textGray">
              {!isChatOpen ? 'المحادثة مغلقة' : typing ? 'يكتب الآن...' : 'متصل'}
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          {otherParty?.phone && (
            <a
              href={`tel:${otherParty.phone}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-2xs"
              title="اتصال هاتفي"
            >
              <FaPhone size={13} />
            </a>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral text-textGray hover:text-textDark transition-colors"
          >
            <FaEllipsisV size={13} />
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-11 z-20 w-48 rounded-2xl border border-neutral bg-white p-1 text-xs shadow-xl animate-slide-up">
              <button
                type="button"
                onClick={() => { setReportOpen(true); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-emergency hover:bg-red-50 font-bold"
              >
                <FaFlag size={11} /> الإبلاغ عن مشكلة
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-textGray hover:bg-neutral font-medium"
              >
                <FaTrash size={11} /> حذف المحادثة
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-center my-2">
          <span className="rounded-full bg-white px-3.5 py-1 text-[11px] font-semibold text-textGray shadow-2xs border border-neutral">
            محادثة مؤمنة بواسطة حرفي
          </span>
        </div>

        {messages.map((msg) => {
          const own = isOwn(msg);
          return (
            <div key={msg._id} className={`group flex ${own ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[78%] ${own ? 'items-start' : 'items-end'} flex flex-col`}>
                <div className="flex items-center gap-1.5">
                  {own && !msg.deleted && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 text-textGray hover:text-emergency p-1"
                      title="حذف الرسالة"
                    >
                      <FaTrash size={10} />
                    </button>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-xs shadow-2xs leading-relaxed ${
                      own
                        ? 'rounded-br-none bg-primary text-white font-medium'
                        : 'rounded-bl-none border border-neutral bg-white text-textDark font-medium'
                    }`}
                  >
                    {msg.deleted ? (
                      <span className="italic opacity-70">تم حذف هذه الرسالة</span>
                    ) : msg.type === 'image' ? (
                      <img src={msg.mediaUrl} alt="" className="max-h-60 rounded-xl object-cover" />
                    ) : msg.type === 'audio' ? (
                      <audio controls src={msg.mediaUrl} className="max-w-[220px]" />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
                <span className="mt-1 text-[10px] text-textGray px-1 font-mono">{formatTime(msg.createdAt || new Date())}</span>
              </div>
            </div>
          );
        })}

        <div className="flex justify-center pt-2">
          <div className="flex items-center gap-2 rounded-2xl border border-tertiary/20 bg-emerald-50 px-4 py-2 text-[11px] font-bold text-emerald-800 shadow-2xs">
            <FaShieldAlt className="text-tertiary" />
            <span>معلوماتك ومعاملاتك المالية محمية بالكامل عبر منصة حرفي</span>
          </div>
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="border-t border-neutral bg-white p-3">
        {!isChatOpen ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-textGray">
            <FaLock /> المحادثة مغلقة لأن هذا الطلب {
              currentOrder?.status === 'completed' ? 'مكتمل'
                : currentOrder?.status === 'disputed' ? 'قيد مراجعة بلاغ'
                : 'ملغي'
            }
          </div>
        ) : (
          <div className="space-y-2">
            {/* Quick replies */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendMessage(reply)}
                  className="shrink-0 rounded-xl border border-borderGray bg-neutral/40 px-3 py-1 text-[11px] font-semibold text-textDark hover:bg-primary/10 hover:text-primary transition-colors"
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-borderGray text-textGray hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                title="إرسال صورة"
              >
                <FaImage size={15} />
              </button>
              <button
                type="button"
                onClick={toggleRecording}
                disabled={uploading}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border border-borderGray transition-colors disabled:opacity-50 ${
                  recording ? 'border-emergency bg-emergency/10 text-emergency animate-pulse' : 'text-textGray hover:border-primary hover:text-primary'
                }`}
                title={recording ? 'إيقاف التسجيل' : 'تسجيل صوتي'}
              >
                {recording ? <FaStop size={13} /> : <FaMicrophone size={15} />}
              </button>
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  getSocket()?.emit('typing', { orderId });
                }}
                placeholder="اكتب رسالتك هنا..."
                className="input-field flex-1 text-xs py-2.5"
              />
              <button
                type="submit"
                disabled={!text.trim() || uploading}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-white shadow-sm hover:bg-secondary/90 transition-all disabled:opacity-50 active:scale-95"
              >
                <FaPaperPlane size={13} />
              </button>
            </form>
          </div>
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
