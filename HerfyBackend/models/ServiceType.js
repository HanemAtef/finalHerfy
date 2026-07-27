const mongoose = require("mongoose");

// Replaces the hardcoded profession enum on Handyman — admins can now add
///rename/retire service types without a code deploy. `key` stays stable
// even if `name` (display label) is edited later.
const serviceTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const ServiceType = mongoose.model("ServiceType", serviceTypeSchema);
module.exports = ServiceType;
