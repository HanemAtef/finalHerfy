import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  FaSearch,
  FaUser,
  FaTools,
  FaPaperPlane,
  FaImage,
  FaShieldAlt,
  FaExternalLinkAlt,
  FaComments,
  FaArrowRight,
} from 'react-icons/fa';
import { connectSocket } from '../../socket/socket';
import { supportService, uploadService } from '../../services/api';
import { formatTime, getDefaultAvatar } from '../../utils/helpers';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function AdminSupportPage() {
  const { user, token } = useSelector((state) => state.auth);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchConversations = async () => {
    try {
      const params = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      if (search.trim()) params.search = search.trim();

      const res = await supportService.getAdminConversations(params);
      if (res.data.success) {
        setConversations(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch admin conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [roleFilter, search]);

  const loadMessages = async (convId) => {
    if (!convId) return;
    setLoadingMessages(true);
    try {
      const res = await supportService.getAdminConversationMessages(convId);
      if (res.data.success) {
        setActiveConversation(res.data.conversation);
        setMessages(res.data.messages || []);
        setConversations((prev) =>
          prev.map((c) => (c._id === convId ? { ...c, unreadAdminCount: 0 } : c))
        );
      }
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    const handleSupportUpdate = ({ conversation: updatedConv, message }) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === updatedConv._id);
        if (exists) {
          return prev.map((c) =>
            c._id === updatedConv._id ? { ...c, ...updatedConv } : c
          );
        }
        return [updatedConv, ...prev];
      });

      if (selectedId === updatedConv._id && message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
    };

    const handleNewMessage = (data) => {
      if (data?.conversationId === selectedId && data?.message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
      }
    };

    socket.on('admin_support_update', handleSupportUpdate);
    socket.on('new_support_message', handleNewMessage);

    if (selectedId) {
      socket.emit('joinSupportRoom', selectedId);
    }

    return () => {
      if (selectedId) {
        socket.emit('leaveSupportRoom', selectedId);
      }
      socket.off('admin_support_update', handleSupportUpdate);
      socket.off('new_support_message', handleNewMessage);
    };
  }, [token, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!replyText.trim() || !selectedId || uploading) return;

    const textToSend = replyText.trim();
    setReplyText('');

    try {
      const res = await supportService.sendAdminMessage(selectedId, { text: textToSend, type: 'text' });
      if (res.data.success) {
        setMessages((prev) => [...prev, res.data.message]);
        setConversations((prev) =>
          prev.map((c) =>
            c._id === selectedId
              ? { ...c, lastMessage: textToSend, lastMessageAt: new Date() }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Failed to send admin reply:', err);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      const uploadRes = await uploadService.uploadImage(file);
      const mediaUrl = uploadRes.data?.url;
      if (mediaUrl) {
        const res = await supportService.sendAdminMessage(selectedId, { type: 'image', mediaUrl, text: '' });
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

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadAdminCount || 0), 0);

  if (loading) return <LoadingSpinner text="جاري تحميل محادثات الدعم..." />;

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-textDark flex items-center gap-2">
            <span>محادثات الدعم الفني والإدارة</span>
            {totalUnread > 0 && (
              <span className="rounded-full bg-emergency px-2.5 py-0.5 text-xs font-bold text-white shadow-sm animate-pulse">
                {totalUnread} غير مقروءة
              </span>
            )}
          </h1>
          <p className="text-xs text-textGray mt-0.5">التواصل الحي والمباشر مع مستخدمي المنصة وحل الشكاوى</p>
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-white border border-borderGray p-1 shadow-2xs">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'customer', label: 'العملاء' },
            { id: 'handyman', label: 'الحرفيين' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                roleFilter === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-textGray hover:text-textDark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 min-h-0 bg-white rounded-3xl border border-neutral shadow-[var(--shadow-card)] overflow-hidden">
        {/* Conversations List Column */}
        <div
          className={`md:col-span-4 lg:col-span-4 flex flex-col border-l border-neutral bg-neutral/20 ${
            mobileShowChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Search Box */}
          <div className="p-3 border-b border-neutral bg-white">
            <div className="relative">
              <FaSearch className="absolute right-3.5 top-1/2 -translate-y-1/2 text-textGray" size={13} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الهاتف..."
                className="input-field pr-9 text-xs py-2"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral/60">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-textGray">
                <FaComments className="mx-auto mb-2 text-3xl opacity-20" />
                <p className="text-xs font-semibold">لا توجد محادثات مطابقة</p>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = selectedId === c._id;
                const isHandyman = c.userRole === 'handyman';
                const hasUnread = (c.unreadAdminCount || 0) > 0;

                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => {
                      setSelectedId(c._id);
                      setMobileShowChat(true);
                    }}
                    className={`w-full text-right p-3.5 transition-all flex items-start gap-3 hover:bg-white/90 ${
                      isSelected ? 'bg-white border-r-4 border-r-primary shadow-sm' : ''
                    } ${hasUnread ? 'bg-primary/5' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl text-white font-bold shadow-2xs ${
                          isHandyman
                            ? 'bg-secondary text-white'
                            : 'bg-primary text-white'
                        }`}
                      >
                        {isHandyman ? <FaTools size={16} /> : <FaUser size={16} />}
                      </div>
                      {hasUnread && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emergency text-[9px] font-bold text-white px-1 shadow-sm">
                          {c.unreadAdminCount}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="text-xs font-bold text-textDark truncate">{c.userName}</h4>
                          <span
                            className={`badge-status text-[10px] font-bold px-1.5 py-0.5 shrink-0 ${
                              isHandyman
                                ? 'bg-secondary/15 text-secondary'
                                : 'bg-primary/10 text-primary'
                            }`}
                          >
                            {isHandyman ? 'حرفي' : 'عميل'}
                          </span>
                        </div>
                        <span className="text-[10px] text-textGray shrink-0 font-mono">
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </div>

                      <p
                        className={`text-xs truncate leading-normal ${
                          hasUnread ? 'font-bold text-textDark' : 'text-textGray'
                        }`}
                      >
                        {c.lastMessage || 'لا توجد رسائل'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Conversation Column */}
        <div
          className={`md:col-span-8 lg:col-span-8 flex flex-col bg-white ${
            !mobileShowChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedId && activeConversation ? (
            <>
              {/* Chat Top Bar */}
              <div className="flex items-center justify-between border-b border-neutral px-5 py-3 bg-white">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileShowChat(false)}
                    className="md:hidden flex h-8 w-8 items-center justify-center rounded-xl bg-neutral text-textGray hover:text-primary"
                  >
                    <FaArrowRight size={13} />
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-textDark text-sm">{activeConversation.userName}</h3>
                      <span
                        className={`badge-status text-[10px] font-bold ${
                          activeConversation.userRole === 'handyman'
                            ? 'bg-secondary/15 text-secondary'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {activeConversation.userRole === 'handyman' ? 'حرفي' : 'عميل'}
                      </span>
                    </div>
                    <p className="text-[11px] text-textGray font-mono" dir="ltr">
                      {activeConversation.userPhone || activeConversation.userEmail || 'مستخدم مسجل'}
                    </p>
                  </div>
                </div>

                <Link
                  to={`/admin/users/${activeConversation.userId?._id || activeConversation.userId}`}
                  target="_blank"
                  className="btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3"
                >
                  <span>عرض الملف الكامل</span>
                  <FaExternalLinkAlt size={10} />
                </Link>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral/30">
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <LoadingSpinner text="جاري تحميل الرسائل..." />
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdminMsg = msg.senderRole === 'admin';

                    return (
                      <div
                        key={msg._id}
                        className={`flex flex-col ${isAdminMsg ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 px-1 mb-1 text-[10px] text-textGray">
                          <span>{isAdminMsg ? 'أنت (إدارة حرفي)' : msg.senderName || activeConversation.userName}</span>
                          <span>•</span>
                          <span>{formatTime(msg.createdAt)}</span>
                        </div>

                        <div
                          className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-2xs text-xs ${
                            isAdminMsg
                              ? 'bg-primary text-white rounded-br-none'
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

              {/* Input Form */}
              <form onSubmit={handleSendReply} className="border-t border-neutral p-3 bg-white">
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
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-borderGray text-textGray hover:border-primary hover:text-primary transition-all disabled:opacity-50"
                    title="إرفاق صورة"
                  >
                    <FaImage size={16} />
                  </button>

                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="اكتب رد الإدارة على المستخدم..."
                    className="input-field flex-1 text-xs py-2.5"
                    disabled={uploading}
                  />

                  <button
                    type="submit"
                    disabled={!replyText.trim() || uploading}
                    className="btn-primary flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-bold shadow-sm"
                  >
                    <FaPaperPlane size={12} />
                    <span>إرسال</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-textGray">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-neutral text-primary/40">
                <FaComments size={32} />
              </div>
              <h3 className="text-base font-bold text-textDark">اختر محادثة من القائمة الجانبية</h3>
              <p className="mt-1 text-xs text-textGray max-w-xs leading-relaxed">
                يمكنك الرد المباشر على استفسارات وبلاغات العملاء والحرفيين مع الحفاظ على الأرشيف.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
