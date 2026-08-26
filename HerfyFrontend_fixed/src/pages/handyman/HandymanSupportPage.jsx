import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaPaperPlane,
  FaImage,
  FaHeadset,
  FaShieldAlt,
  FaTools,
} from 'react-icons/fa';
import { connectSocket } from '../../socket/socket';
import { supportService, uploadService } from '../../services/api';
import { formatTime } from '../../utils/helpers';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const QUICK_INQUIRIES = [
  'استفسار عن رصيد المحفظة والأرباح',
  'مشكلة في توثيق الحساب أو المستندات',
  'طلب إلغاء أو تعديل حالة طلب',
  'استفسار بخصوص تسوية العمولات',
];

export default function HandymanSupportPage() {
  const navigate = useNavigate();
  const { user, token } = useSelector((state) => state.auth);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadConversation = async () => {
    try {
      const res = await supportService.getMyConversation();
      if (res.data.success) {
        setConversation(res.data.conversation);
        setMessages(res.data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load support conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversation();
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    if (conversation?._id) {
      socket.emit('joinSupportRoom', conversation._id);
    }

    const handleNewMessage = (data) => {
      if (data?.message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
      }
    };

    socket.on('new_support_message', handleNewMessage);

    return () => {
      if (conversation?._id) {
        socket.emit('leaveSupportRoom', conversation._id);
      }
      socket.off('new_support_message', handleNewMessage);
    };
  }, [token, conversation?._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!text.trim() || uploading) return;

    const messageText = text.trim();
    setText('');

    try {
      const res = await supportService.sendUserMessage({ text: messageText, type: 'text' });
      if (res.data.success) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.data.message._id)) return prev;
          return [...prev, res.data.message];
        });
        if (res.data.conversation) {
          setConversation(res.data.conversation);
        }
      }
    } catch (err) {
      console.error('Failed to send support message:', err);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadRes = await uploadService.uploadImage(file);
      const mediaUrl = uploadRes.data?.url;
      if (mediaUrl) {
        const res = await supportService.sendUserMessage({ type: 'image', mediaUrl, text: '' });
        if (res.data.success) {
          setMessages((prev) => [...prev, res.data.message]);
        }
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (loading) return <LoadingSpinner text="جاري فتح المحادثة..." />;

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] max-w-2xl flex-col rounded-3xl bg-white shadow-[var(--shadow-card)] border border-neutral overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral bg-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral text-textGray hover:text-primary transition-colors"
          >
            <FaArrowRight size={13} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/10 text-secondary shadow-sm">
            <FaTools size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-textDark text-sm">دعم الحرفيين والإدارة</h2>
              <span className="flex h-2 w-2 rounded-full bg-tertiary"></span>
            </div>
            <p className="text-[11px] text-textGray flex items-center gap-1 mt-0.5">
              <FaShieldAlt className="text-secondary" size={10} />
              <span>محادثة مباشرة مع مسؤولي منصة حرفي</span>
            </p>
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-neutral/40">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
              <FaHeadset size={26} />
            </div>
            <h3 className="text-base font-bold text-textDark">مرحباً بك في مركز دعم الحرفيين</h3>
            <p className="mt-1 text-xs text-textGray max-w-xs leading-relaxed">
              نحن هنا لمساعدتك في كل ما يخص حسابك، الطلبات، المحفظة المالية، وتوثيق المستندات.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-md">
              {QUICK_INQUIRIES.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setText(q)}
                  className="rounded-xl border border-secondary/20 bg-white px-3 py-1.5 text-xs font-semibold text-secondary shadow-sm hover:bg-secondary/5 hover:border-secondary transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderRole === 'handyman' || msg.senderId === user?._id;
            return (
              <div
                key={msg._id}
                className={`flex flex-col ${isMe ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-1.5 px-1 mb-1 text-[10px] text-textGray">
                  <span>{isMe ? 'أنت (حرفي)' : msg.senderName || 'إدارة حرفي'}</span>
                  <span>•</span>
                  <span>{formatTime(msg.createdAt)}</span>
                </div>

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                    isMe
                      ? 'bg-secondary text-white rounded-br-none'
                      : 'bg-white border border-neutral text-textDark rounded-bl-none'
                  }`}
                >
                  {msg.type === 'image' && msg.mediaUrl ? (
                    <img
                      src={msg.mediaUrl}
                      alt="مرفق"
                      className="max-h-60 rounded-xl object-cover"
                    />
                  ) : (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="border-t border-neutral bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-borderGray text-textGray hover:border-secondary hover:text-secondary transition-all disabled:opacity-50"
            title="إرفاق صورة"
          >
            <FaImage size={16} />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب استفسارك لإدارة المنصة..."
            className="input-field flex-1 text-sm py-2.5"
            disabled={uploading}
          />

          <button
            type="submit"
            disabled={!text.trim() || uploading}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-white shadow-sm hover:bg-secondary/90 transition-all disabled:opacity-50 active:scale-95"
          >
            <FaPaperPlane size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
