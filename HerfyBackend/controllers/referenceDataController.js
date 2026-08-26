// Admin-managed reference data: service types (professions).
// Public GET endpoints feed dropdowns on register/handyman forms; admin
// endpoints let staff add/rename/retire entries without a deploy.
const ServiceType = require("../models/ServiceType");
const AuditLog = require("../models/AuditLog");
const Handyman = require("../models/Handyman");

const slugify = (s) =>
  s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\u0600-\u06FFa-z0-9-]/g, "");

// ---------- Service Types (professions) ----------
const listServiceTypes = async (req, res) => {
  try {
    const onlyActive = req.query.all !== "true";
    const filter = onlyActive ? { isActive: true } : {};
    const types = await ServiceType.find(filter).sort({ name: 1 });
    res.status(200).json({ data: types });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const createServiceType = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ msg: "الاسم مطلوب" });

    const key = slugify(name);
    const exists = await ServiceType.findOne({ $or: [{ name }, { key }] });
    if (exists) return res.status(400).json({ msg: "التخصص موجود بالفعل" });

    const type = await ServiceType.create({ key, name });
    await AuditLog.create({ adminId: req.user._id, action: "serviceType.create", targetType: "ServiceType", targetId: type._id, meta: { name } });
    res.status(201).json({ msg: "تمت الإضافة", data: type });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const updateServiceType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const type = await ServiceType.findById(id);
    if (!type) return res.status(404).json({ msg: "غير موجود" });

    if (name !== undefined) type.name = name;
    if (isActive !== undefined) type.isActive = isActive;
    await type.save();

    await AuditLog.create({ adminId: req.user._id, action: "serviceType.update", targetType: "ServiceType", targetId: type._id, meta: { name, isActive } });
    res.status(200).json({ msg: "تم التحديث", data: type });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const deleteServiceType = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceType = await ServiceType.findById(id);
    const handymenReferencing = serviceType
      ? await Handyman.countDocuments({ profession: serviceType.name })
      : 0;

    await ServiceType.findByIdAndDelete(id);
    await AuditLog.create({ adminId: req.user._id, action: "serviceType.delete", targetType: "ServiceType", targetId: id });
    res.status(200).json({
      msg: "تم الحذف",
      warning: handymenReferencing > 0
        ? `${handymenReferencing} handyman/handymen still reference this profession — their profession field is now orphaned display data.`
        : undefined,
    });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// One-time seed from the old hardcoded enum, so existing data keeps working
// even before the admin has added anything through the new UI.
const DEFAULT_PROFESSIONS = [
  "سباك",
  "كهربائي",
  "نجار",
  "نقاش",
  "فني تكييف",
  "أجهزة منزلية",
  "حداد",
  "ألوميتال وزجاج",
  "دش وستالايت",
  "كاميرات وشبكات",
  "سيراميك وأرضيات",
  "جبس بورد وديكور",
  "عزل وأسطح",
  "تنظيف وصيانة",
  "ميكانيكي",
  "سمكري",
];
const ensureSeeded = async () => {
  const count = await ServiceType.countDocuments();
  if (count === 0) {
    await ServiceType.insertMany(
      DEFAULT_PROFESSIONS.map((name) => ({ key: slugify(name), name }))
    );
  }
};

module.exports = {
  listServiceTypes, createServiceType, updateServiceType, deleteServiceType,
  ensureSeeded,
};
