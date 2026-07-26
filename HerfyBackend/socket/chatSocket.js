const Message = require("../models/Message");
const Order = require("../models/Order");

const registerChatSocket = (io) => {

    io.on("connection", (socket) => {

        // console.log(`${socket.user.name} Connected`);

        socket.on("joinRoom", async (orderId) => {

            const order = await Order.findById(orderId);

            if (!order)
                return;

            const userId = socket.user._id.toString();

            const allowed =
                order.customerId.toString() === userId ||
                order.handymanId.toString() === userId;

            if (!allowed)
                return;

            socket.join(orderId);

        });

        // `type`/`mediaUrl` let the same event carry text, image, or audio
        // messages — the client uploads media via /api/uploads first, then
        // emits this with the returned URL.
        socket.on("sendMessage", async ({ orderId, text, type = "text", mediaUrl }) => {

            try {

                const order = await Order.findById(orderId);

                if (!order)
                    return;

                const userId = socket.user._id.toString();

                const allowed =
                    order.customerId.toString() === userId ||
                    order.handymanId.toString() === userId;

                if (!allowed)
                    return;

                if (
                    order.status === "completed" ||
                    order.status === "cancelled" ||
                    order.status === "disputed"
                ) {
                    return;
                }

                if (type === "text" && !text) return;
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

                io.to(orderId).emit("receiveMessage", newMessage);

            } catch (err) {

                // console.log(err);

            }

        });

        // Sender deletes their own message — broadcast the soft-deleted
        // version so both clients update in place.
        socket.on("deleteMessage", async (messageId) => {
            try {
                const message = await Message.findById(messageId);
                if (!message) return;

                if (message.sender.toString() !== socket.user._id.toString()) return;

                message.deleted = true;
                message.text = "";
                message.mediaUrl = null;
                await message.save();

                io.to(message.orderId.toString()).emit("messageDeleted", { _id: message._id, orderId: message.orderId });
            } catch (err) {
                // console.log(err);
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
