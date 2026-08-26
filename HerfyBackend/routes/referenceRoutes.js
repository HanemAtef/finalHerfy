// Public, read-only endpoints so registration/handyman forms can populate
// profession dropdowns from the admin-managed lists.
const express = require("express");
const router = express.Router();
const { listServiceTypes } = require("../controllers/referenceDataController");

router.get("/service-types", listServiceTypes);

module.exports = router;
