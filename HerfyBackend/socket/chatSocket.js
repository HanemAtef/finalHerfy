const Message = require("../models/Message");
const Order = require("../models/Order");
const mongoose = require("mongoose");
const { createNotification } = require("../controllers/notificationController");

const OPEN_STATUSES = ["pending", "accepted", "price_confirmed", "in-progress"];

const isValidId = (id) => typeof id === "string" && mongoose.isValidObjectId(id);

const canAccessOrder = (order, userId) =>
    order.customerId?.toString() === userId ||
    order.handymanId?.toString() === userId;

const registerChatSocket = (io) => {

    io.on("connection", (socket) => {

        // console.log(`${socket.user.name} Connected`);
        // Message delivery must not depend on a page-specific order room.
        // A user can reconnect while the chat page is open, which drops that
        // room membership. Every authenticated socket instead has a stable
        // user room for direct delivery to either party in an order.
        socket.join(`user_${socket.user._id.toString()}`);

        socket.on("joinRoom", async (orderId, acknowledge) => {
            const reply = typeof acknowledge === "function" ? acknowledge : () => {};
            try {
                if (!isValidId(orderId)) return reply({ ok: false, error: "Invalid order id" });

                const order = await Order.findById(orderId);
                if (!order || !canAccessOrder(order, socket.user._id.toString())) {
                    return reply({ ok: false, error: "Not allowed to join this chat" });
                }

                await socket.join(orderId);
                reply({ ok: true });
            } catch (err) {
                console.error("Chat room join failed:", err.message);
                reply({ ok: false, error: "Unable to join chat" });
            }
        });

        // `type`/`mediaUrl` let the same event carry text, image, or audio
        // messages — the client uploads media via /api/uploads first, then
        // emits this with the returned URL.
        socket.on("sendMessage", async (payload = {}) => {

            try {
                const { orderId, text, type = "text", mediaUrl } = payload;
                if (!isValidId(orderId) || !["text", "image", "audio"].includes(type)) return;

                const order = await Order.findById(orderId);

                if (!order)
                    return;

                const userId = socket.user._id.toString();

                if (!canAccessOrder(order, userId))
                    return;

                if (!OPEN_STATUSES.includes(order.status)) return;

                if (type === "text" && (!text || typeof text !== "string")) return;
                if (type !== "text" && !mediaUrl) return;

                const message = await Message.create({

                    orderId,

                    sender: socket.user._id,

                    type,

                    text: type === "text" ? text : "",

                    mediaUrl: type !== "text" ? mediaUrl : undefined,

                });

                const newMessage = await Message.findById(message._id)
                    .populate("sender", "name profileImage role");

                const recipientRooms = [
                    `user_${order.customerId.toString()}`,
                    `user_${order.handymanId.toString()}`,
                ];
                io.to(recipientRooms).emit("receiveMessage", newMessage);

                const recipientId =
                    order.customerId.toString() === userId
                        ? order.handymanId
                        : order.customerId;
                await createNotification(
                    io,
                    recipientId,
                    "new_message",
                    "New message",
                    type === "text" ? text.trim() : "Sent you an attachment",
                    { orderId: order._id, messageId: message._id }
                );

            } catch (err) {
                console.error("Chat message send failed:", err.message);
            }

        });

        // Sender deletes their own message — broadcast the soft-deleted
        // version so both clients update in place.
        socket.on("deleteMessage", async (messageId) => {
            try {
                if (!isValidId(messageId)) return;

                const message = await Message.findById(messageId);
                if (!message) return;

                if (message.sender.toString() !== socket.user._id.toString()) return;

                message.deleted = true;
                message.text = "";
                message.mediaUrl = null;
                await message.save();

                io.to(message.orderId.toString()).emit("messageDeleted", { _id: message._id, orderId: message.orderId });
            } catch (err) {
                console.error("Chat message deletion failed:", err.message);
            }
        });

        socket.on("typing", (data) => {
            const orderId = typeof data === "string" ? data : data?.orderId;
            if (orderId) socket.to(orderId).emit("typing");
        });

        socket.on("disconnect", () => {

            // console.log(`${socket.user.name} Disconnected`);

        });

    });

};

module.exports = registerChatSocket;
