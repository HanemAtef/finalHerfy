// Public, read-only endpoints so registration/handyman forms can populate
// city and profession dropdowns from the admin-managed lists.
const express = require("express");
const router = express.Router();
const { listCities, listServiceTypes } = require("../controllers/referenceDataController");

router.get("/cities", listCities);
router.get("/service-types", listServiceTypes);

module.exports = router;
