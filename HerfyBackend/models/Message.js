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
  { timestamps: true },
);

messageSchema.pre("validate", function () {
  if (this.type === "text" && !this.text) {
    this.invalidate("text", "text is required for text messages");
  }
  if (this.type !== "text" && !this.mediaUrl) {
    this.invalidate("mediaUrl", "mediaUrl is required for media messages");
  }
});
messageSchema.index({ orderId: 1 });
messageSchema.index({ sender: 1 });

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
