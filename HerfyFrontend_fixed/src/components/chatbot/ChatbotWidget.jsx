import { useState, useRef, useEffect } from 'react';
import { FaRobot, FaTimes, FaPaperPlane } from 'react-icons/fa';
import { chatbotService } from '../../services/api';

const WELCOME_MESSAGE = {
  role: 'model',
  text: 'أهلاً! أنا مساعد حرفي 🛠️ اسألني عن أي حاجة متعلقة بالتطبيق — إزاي تطلب حرفي، العمولة، الإلغاء، أو أي استفسار تاني.',
};

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError('');
    const nextMessages = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      // Send a rolling history (excluding the welcome message, which the
      // backend already knows about via the system instruction).
      const history = nextMessages
        .slice(1, -1)
        .map(({ role, text }) => ({ role, text }));

      const res = await chatbotService.ask({ message: text, history });
      setMessages((prev) => [...prev, { role: 'model', text: res.data.reply }]);
    } catch (err) {
      setError(err.response?.data?.msg || 'حصل خطأ، حاول تاني');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 left-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 md:bottom-6"
        aria-label="مساعد هرفي الذكي"
      >
        {open ? <FaTimes size={20} /> : <FaRobot size={22} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-36 left-4 z-50 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-borderGray bg-white shadow-2xl md:bottom-24">
          <div className="flex items-center gap-2 bg-primary px-4 py-3 text-white">
            <FaRobot size={18} />
            <div>
              <p className="text-sm font-bold">مساعد هرفي</p>
              <p className="text-[11px] text-white/80">هنا عشان أساعدك في أي وقت</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-neutral px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-bl-sm bg-primary text-white'
                      : 'rounded-br-sm border border-borderGray bg-white text-textDark'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-br-sm border border-borderGray bg-white px-3 py-2">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-textGray [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-textGray [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-textGray" />
                </div>
              </div>
            )}
          </div>

          {error && <p className="px-3 py-1 text-xs text-emergency">{error}</p>}

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-borderGray p-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك هنا..."
              className="input-field flex-1 text-sm"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
              aria-label="إرسال"
            >
              <FaPaperPlane size={13} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
