const express = require("express");
const {
  loginLogistics,
  addPersonnel,
  updatePersonnel,
  deletePersonnel,
  getBaseAssets,
  getMyLogs
} = require("../controllers/logisticsController.js");
const { authorizeLogistics } = require("../middleware/authMiddleware.js");

const router = express.Router();

router.post("/login", loginLogistics);
router.post("/personnel", authorizeLogistics, addPersonnel);
router.put("/personnel/:id", authorizeLogistics, updatePersonnel);
router.delete("/personnel/:id", authorizeLogistics, deletePersonnel);
router.get("/assets", authorizeLogistics, getBaseAssets);
router.get("/logs", authorizeLogistics, getMyLogs);

module.exports = router;
