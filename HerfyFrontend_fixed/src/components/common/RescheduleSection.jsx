import { useState } from 'react';
import { FaCalendarAlt, FaClock, FaTimes, FaCheck, FaHistory, FaExclamationCircle } from 'react-icons/fa';
import { orderService } from '../../services/api';
import { formatDate, formatDateTime, normalizeOrderStatus } from '../../utils/helpers';

export default function RescheduleSection({ order, currentUserRole, onOrderUpdated }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [responding, setResponding] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!order) return null;

  const normalizedStatus = normalizeOrderStatus(order.status);
  const isScheduledStatus = ['scheduled', 'price_confirmed'].includes(order.status) || normalizedStatus === 'scheduled';

  // Strict check: only allow reschedule when order is actively SCHEDULED
  const canRequestReschedule = isScheduledStatus &&
    (!order.rescheduleRequest || order.rescheduleRequest.status !== 'pending');

  // Strict check: only show pending reschedule request if the order is still in SCHEDULED status
  const pendingRequest = isScheduledStatus && order.rescheduleRequest && order.rescheduleRequest.status === 'pending'
    ? order.rescheduleRequest
    : null;

  const isMyRequest = pendingRequest && pendingRequest.requestedBy === currentUserRole;
  const isPendingForMe = pendingRequest && pendingRequest.requestedBy !== currentUserRole;

  const todayStr = new Date().toISOString().split('T')[0];

  const handleOpenModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setReason('');
    setNewDate('');
    setNewTime('');
    setModalOpen(true);
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (!newDate || !newTime) {
      setErrorMsg('يرجى تحديد التاريخ والوقت الجديدين.');
      return;
    }

    const combinedDateTime = new Date(`${newDate}T${newTime}`);
    if (isNaN(combinedDateTime.getTime()) || combinedDateTime.getTime() <= Date.now()) {
      setErrorMsg('لا يمكن اختيار موعد في الماضي. يرجى اختيار موعد قادم.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await orderService.requestReschedule(order._id, {
        newDate: combinedDateTime.toISOString(),
        newTime,
        reason: reason.trim(),
      });
      setSuccessMsg('تم إرسال طلب إعادة الجدولة بنجاح.');
      setModalOpen(false);
      if (onOrderUpdated) onOrderUpdated(res.data.order);
    } catch (err) {
      setErrorMsg(err.response?.data?.msg || 'تعذر إرسال طلب إعادة الجدولة.');
    } finally {
      setSubmitting(false);
    }
  };

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleRespond = async (accepted, reasonText = '') => {
    setResponding(true);
    setErrorMsg(null);
    try {
      const res = await orderService.respondReschedule(order._id, {
        accepted,
        rejectionReason: reasonText.trim(),
      });
      setSuccessMsg(accepted ? 'تمت الموافقة على الموعد الجديد بنجاح.' : 'تم رفض طلب الموعد الجديد.');
      setRejectModalOpen(false);
      setRejectionReason('');
      if (onOrderUpdated) onOrderUpdated(res.data.order);
    } catch (err) {
      setErrorMsg(err.response?.data?.msg || 'تعذر معالجة الطلب.');
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Success / Error Messages */}
      {successMsg && (
        <div className="p-3 bg-tertiary/10 border border-tertiary/20 text-tertiary rounded-xl text-xs font-bold">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-emergency/10 border border-emergency/20 text-emergency rounded-xl text-xs font-bold flex items-center gap-2">
          <FaExclamationCircle />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Pending Reschedule Request Banner */}
      {pendingRequest && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 font-extrabold text-sm">
              <FaCalendarAlt size={15} />
              <span>طلب إعادة جدولة الموعد (قيد الانتظار)</span>
            </div>
            <span className="badge-status bg-amber-500/20 text-amber-700 text-xs font-bold px-2.5 py-0.5">
              قيد المراجعة
            </span>
          </div>

          <div className="text-xs text-textDark space-y-1.5 bg-white/70 p-3 rounded-xl border border-amber-500/20">
            <p>
              <span className="text-textGray">مرسل الطلب: </span>
              <span className="font-bold">
                {pendingRequest.requestedBy === 'customer' ? 'العميل' : 'الحرفي'}
              </span>
            </p>
            {order.scheduledDate && (
              <p>
                <span className="text-textGray">الموعد الحالي: </span>
                <span className="font-semibold text-textDark">
                  {formatDateTime(order.scheduledDate, order.scheduledTime)}
                </span>
              </p>
            )}
            <p>
              <span className="text-textGray">الموعد المقترح الجديد: </span>
              <span className="font-extrabold text-primary">
                {formatDateTime(pendingRequest.newDate, pendingRequest.newTime)}
              </span>
            </p>
            {pendingRequest.reason && (
              <p>
                <span className="text-textGray">السبب: </span>
                <span className="font-medium text-textDark">{pendingRequest.reason}</span>
              </p>
            )}
          </div>

          {/* Action buttons for recipient */}
          {isPendingForMe && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleRespond(true)}
                disabled={responding}
                className="btn-primary flex-1 py-2 text-xs font-bold shadow-sm"
              >
                <FaCheck size={11} /> موافقة على الموعد الجديد
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectionReason('');
                  setRejectModalOpen(true);
                }}
                disabled={responding}
                className="flex-1 rounded-xl bg-emergency text-white px-3 py-2 text-xs font-bold hover:bg-emergency/90 transition shadow-sm flex items-center justify-center gap-1"
              >
                <FaTimes size={11} /> رفض الموعد
              </button>
            </div>
          )}

          {isMyRequest && (
            <p className="text-[11px] text-amber-700 font-semibold text-center">
              تم إرسال طلبك وبانتظار رد الطرف الآخر للموافقة على الموعد الجديد.
            </p>
          )}
        </div>
      )}

      {/* Button to open Reschedule modal */}
      {canRequestReschedule && (
        <button
          type="button"
          onClick={handleOpenModal}
          className="btn-outline flex items-center justify-center gap-2 w-full text-xs py-2.5 font-bold"
        >
          <FaCalendarAlt size={12} className="text-secondary" />
          <span>طلب إعادة جدولة الموعد</span>
        </button>
      )}

      {/* Reschedule History Section */}
      {order.rescheduleHistory && order.rescheduleHistory.length > 0 && (
        <div className="rounded-2xl border border-neutral bg-neutral/30 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-textDark">
            <FaHistory size={13} className="text-textGray" />
            <span>سجل طلبات إعادة الجدولة (Reschedule History)</span>
          </div>

          <div className="divide-y divide-neutral/80 text-xs space-y-2">
            {order.rescheduleHistory.map((item, idx) => (
              <div key={idx} className="pt-2 first:pt-0 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-textGray">
                    بواسطة: <strong className="text-textDark">{item.requestedBy === 'customer' ? 'العميل' : 'الحرفي'}</strong>
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      item.status === 'approved'
                        ? 'bg-tertiary/15 text-tertiary'
                        : 'bg-emergency/15 text-emergency'
                    }`}
                  >
                    {item.status === 'approved' ? 'تمت الموافقة ✓' : 'تم الرفض ✗'}
                  </span>
                </div>
                <p className="text-xs text-textDark">
                  الموعد: <strong className="text-primary">{formatDateTime(item.newDate, item.newTime)}</strong>
                </p>
                {item.reason && (
                  <p className="text-[11px] text-textGray">السبب: {item.reason}</p>
                )}
                {item.rejectionReason && (
                  <p className="text-[11px] text-emergency">سبب الرفض: {item.rejectionReason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reschedule Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-neutral">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <FaCalendarAlt />
                <span>إعادة جدولة موعد الطلب</span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl p-1 text-textGray hover:bg-neutral"
              >
                <FaTimes size={16} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-emergency/10 border border-emergency/20 text-emergency rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSendRequest} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-textDark mb-1">
                  تاريخ الموعد الجديد:
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="input-field text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-textDark mb-1">
                  الوقت المقترح:
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="input-field text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-textDark mb-1">
                  سبب إعادة الجدولة:
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: حدث ظرف طارئ وأحتاج تأجيل الموعد..."
                  className="input-field resize-none text-xs"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-secondary flex-1 py-2.5 text-xs font-bold shadow-md"
                >
                  {submitting ? 'جاري الإرسال...' : 'إرسال طلب إعادة الجدولة'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-outline py-2.5 px-4 text-xs font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-neutral">
              <div className="flex items-center gap-2 text-emergency font-bold text-sm">
                <FaTimes />
                <span>رفض طلب إعادة الجدولة</span>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="rounded-xl p-1 text-textGray hover:bg-neutral"
              >
                <FaTimes size={16} />
              </button>
            </div>

            <p className="text-xs text-textGray leading-relaxed">
              عند رفض الموعد المقترح، سيظل الموعد الأصلي للطلب سارياً كما هو دون أي تغيير.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRespond(false, rejectionReason);
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-bold text-textDark mb-1">
                  سبب الرفض (اختياري):
                </label>
                <textarea
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="اكتب سبب الرفض إن وجد..."
                  className="input-field resize-none text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={responding}
                  className="rounded-xl bg-emergency text-white flex-1 py-2.5 text-xs font-bold hover:bg-emergency/90 transition shadow-md"
                >
                  {responding ? 'جاري الرفض...' : 'تأكيد رفض الموعد'}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="btn-outline py-2.5 px-4 text-xs font-semibold"
                >
                  تراجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
