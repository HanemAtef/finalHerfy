const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      trim: true,
      default: "",
    },

    type: {
      type: String,
      enum: ["text", "image", "audio"],
      default: "text",
    },

    mediaUrl: {
      type: String,
      default: null,
    },

    deleted: {
      type: Boolean,
      default: false,
    },

    seen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
messageSchema.pre("validate", function (next) {
  if (this.type === "text" && !this.text) {
    return next(new Error("text is required for text messages"));
  }
  if (this.type !== "text" && !this.mediaUrl) {
    return next(new Error("mediaUrl is required for media messages"));
  }
  next();
});
messageSchema.index({ orderId: 1 });
messageSchema.index({ sender: 1 });

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;