    const Notification = require("../models/Notification");

    // ========== 1. Get All Notifications for Current User ==========
    const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        const unreadCount = await Notification.countDocuments({
        userId: req.user.id,
        isRead: false,
        });

        const total = await Notification.countDocuments({ userId: req.user.id });

        res.status(200).json({
        data: notifications,
        unreadCount,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
        },
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 2. Mark Notification as Read ==========
    const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findOne({
        _id: id,
        userId: req.user.id,
        });

        if (!notification) {
        return res.status(404).json({ msg: "Notification not found" });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        res.status(200).json({
        msg: "Notification marked as read",
        notification,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 3. Mark All Notifications as Read ==========
    const markAllAsRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
        { userId: req.user.id, isRead: false },
        { isRead: true, readAt: new Date() }
        );

        res.status(200).json({
        msg: "All notifications marked as read",
        updatedCount: result.modifiedCount,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 4. Get Unread Count ==========
    const getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
        userId: req.user.id,
        isRead: false,
        });

        res.status(200).json({ unreadCount: count });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 5. Delete Notification ==========
    const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findOneAndDelete({
        _id: id,
        userId: req.user.id,
        });

        if (!notification) {
        return res.status(404).json({ msg: "Notification not found" });
        }

        res.status(200).json({ msg: "Notification deleted successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 6. Create Notification (Centralized Arabic Helper) ==========
    const ARABIC_MESSAGES = {
      order_created: { title: 'طلب جديد 🟣', body: (d) => `${d.customerName || 'عميل'} قام بتقديم طلب جديد: ${d.profession || ''}`.trim() },
      order_accepted: { title: 'تم قبول الطلب 🟠', body: () => 'قام الحرفي بقبول طلبك وتحديد السعر' },
      order_rejected: { title: 'تم رفض الطلب 🔴', body: () => 'عذراً، تعذر قبول الطلب في الوقت الحالي' },
      order_cancelled: { title: 'تم إلغاء الطلب 🔴', body: (d) => `${d.byName || 'المستخدم'} قام بإلغاء الطلب` },
      order_completed: { title: 'تم إكتمال الطلب 🟢', body: () => 'تم إنجاز وإتمام العمل بنجاح' },
      price_confirmed: { title: 'تأكيد السعر 🟠', body: () => 'قام العميل بتأكيد السعر المباشر للطلب' },
      handyman_on_the_way: { title: 'الحرفي في الطريق 🟠', body: () => 'الحرفي في طريقه إليك الآن' },
      payment_confirmed: { title: 'تأكيد الدفع 🟢', body: () => 'تم تأكيد استلام المبلغ نقداً بنجاح' },
      new_message: { title: 'رسالة جديدة 🔵', body: (d) => `لديك رسالة جديدة من ${d.senderName || 'المستخدم'}` },
      penalty_warning: { title: 'تحذير غرامة 🟡', body: (d) => `تم تطبيق غرامة بقيمة ${d.penaltyAmount || 50} ج.م بسبب إلغاء الطلبات المتكرر` },
      report_filed: { title: 'بلاغ جديد 🟡', body: () => 'تم إرسال البلاغ وقيد مراجعة فريق الدعم' },
      report_resolved: { title: 'تم معالجة البلاغ 🔵', body: () => 'تمت مراجعة البلاغ واتخاذ الإجراء المناسب' },
      emergency_request: { title: 'طلب طارئ فوري 🟣', body: () => 'يوجد طلب فوري طارئ يتطلب الاستجابة' },
      reschedule_request: { title: 'طلب تغيير الموعد 🟡', body: () => 'تم تقديم طلب لإعادة جدولة موعد الخدمة' },
      reschedule_response: { title: 'رد على تغيير الموعد 🟠', body: () => 'تم الرد على طلب إعادة الجدولة' },
      handyman_verified: { title: 'تم توثيق الحساب 🟢', body: () => 'تهانينا! تم الاعتماد وتوثيق حسابك بنجاح' },
      handyman_rejected: { title: 'رفض طلب التوثيق 🔴', body: (d) => d.reason ? `تم رفض طلب التوثيق. السبب: ${d.reason}` : 'تم رفض طلب التوثيق. يرجى مراجعة البيانات' },
      handyman_suspended: { title: 'إيقاف الحساب 🔴', body: (d) => d.reason ? `تم إيقاف حسابك مؤقتاً. السبب: ${d.reason}` : 'تم إيقاف حسابك مؤقتاً من قبل الإدارة' },
      handyman_unsuspended: { title: 'تنشيط الحساب 🔵', body: () => 'تم إلغاء الإيقاف وإعادة تنشيط حسابك' },
      account_blocked: { title: 'حظر الحساب 🔴', body: () => 'تم حظر حسابك لمخالفة الشروط والأحكام' },
      account_deleted: { title: 'حذف الحساب 🔴', body: () => 'تم حذف الحساب بشكل نهائي' },
      system_alert: { title: 'تنبيه من النظام 🔵', body: (d) => d.customBody || 'تنبيه جديد من إدارة المنصة' },
      promotion: { title: 'عرض خاص 🔵', body: (d) => d.customBody || 'عروض وتحديثات جديدة متاحة الآن' },
    };

    const createNotification = async (io, userId, type, title, body, data = {}) => {
      try {
        const arabicConfig = ARABIC_MESSAGES[type];
        const finalTitle = arabicConfig ? arabicConfig.title : (title || 'إشعار جديد');
        const finalBody = arabicConfig ? arabicConfig.body({ ...data, customBody: body }) : (body || 'لديك إشعار جديد');

        const notification = await Notification.create({
          userId,
          type,
          title: finalTitle,
          body: finalBody,
          data,
        });

        if (io) {
          io.to(`user_${userId}`).emit('new-notification', notification);
        }

        return notification;
      } catch (error) {
        console.log(' Error creating notification:', error);
        return null;
      }
    };

    module.exports = {
      getNotifications,
      markAsRead,
      markAllAsRead,
      getUnreadCount,
      deleteNotification,
      createNotification,
    };