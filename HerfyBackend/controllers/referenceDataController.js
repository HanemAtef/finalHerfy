// Admin-managed reference data: cities & service types (professions).
// Public GET endpoints feed dropdowns on register/handyman forms; admin
// endpoints let staff add/rename/retire entries without a deploy.
const City = require("../models/City");
const ServiceType = require("../models/ServiceType");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const Handyman = require("../models/Handyman");

const slugify = (s) =>
  s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\u0600-\u06FFa-z0-9-]/g, "");

// ---------- Cities ----------
const listCities = async (req, res) => {
  try {
    const onlyActive = req.query.all !== "true";
    const filter = onlyActive ? { isActive: true } : {};
    const cities = await City.find(filter).sort({ name: 1 });
    res.status(200).json({ data: cities });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const createCity = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ msg: "الاسم مطلوب" });

    const exists = await City.findOne({ name });
    if (exists) return res.status(400).json({ msg: "المدينة موجودة بالفعل" });

    const city = await City.create({ name });
    await AuditLog.create({ adminId: req.user._id, action: "city.create", targetType: "City", targetId: city._id, meta: { name } });
    res.status(201).json({ msg: "تمت الإضافة", data: city });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const city = await City.findById(id);
    if (!city) return res.status(404).json({ msg: "غير موجودة" });

    if (name !== undefined) city.name = name;
    if (isActive !== undefined) city.isActive = isActive;
    await city.save();

    await AuditLog.create({ adminId: req.user._id, action: "city.update", targetType: "City", targetId: city._id, meta: { name, isActive } });
    res.status(200).json({ msg: "تم التحديث", data: city });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    // FIX (Low #5): City.name is a free-text string on User.city, not a
    // hard foreign key, so deleting a City doesn't error — but it silently
    // orphans display data for any user already set to it. Not blocking
    // the delete (matches how this data is modeled), but surfacing a
    // count so the admin UI can warn before/after the action.
    const city = await City.findById(id);
    const usersReferencing = city ? await User.countDocuments({ city: city.name }) : 0;

    await City.findByIdAndDelete(id);
    await AuditLog.create({ adminId: req.user._id, action: "city.delete", targetType: "City", targetId: id });
    res.status(200).json({
      msg: "تم الحذف",
      warning: usersReferencing > 0
        ? `${usersReferencing} user(s) still reference this city name — their city field is now orphaned display data.`
        : undefined,
    });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

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
    // FIX (Low #5): same rationale as deleteCity above — ServiceType.name
    // is free text on Handyman.profession, not a hard reference.
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
const DEFAULT_PROFESSIONS = ["سباك", "كهربائي", "نجار", "دهان", "ميكانيكي", "سمكري"];
const ensureSeeded = async () => {
  const count = await ServiceType.countDocuments();
  if (count === 0) {
    await ServiceType.insertMany(
      DEFAULT_PROFESSIONS.map((name) => ({ key: slugify(name), name }))
    );
  }
};

module.exports = {
  listCities, createCity, updateCity, deleteCity,
  listServiceTypes, createServiceType, updateServiceType, deleteServiceType,
  ensureSeeded,
};
