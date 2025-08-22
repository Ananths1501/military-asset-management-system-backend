// routes/commanderRoutes.js
const express = require("express");
const {
  loginCommander,
  listLogistics,
  addLogistics,
  updateLogistics,
  deleteLogistics,
  requestPurchase,
  requestTransfer,
  reviewTransferRequest,
  assignToPersonnel,
  getBaseLogs,
} = require("../controllers/commanderController");
const { authorizeCommander } = require("../middleware/authMiddleware");

const router = express.Router();

// ================= AUTH =================
router.post("/login", loginCommander);
// logistics officers under THIS commander's base
router.get("/logistics", authorizeCommander, listLogistics);
router.post("/logistics", authorizeCommander, addLogistics);
router.put("/logistics/:id", authorizeCommander, updateLogistics);
router.delete("/logistics/:id", authorizeCommander, deleteLogistics);



// purchase request
router.post("/purchases", authorizeCommander, requestPurchase);

// transfer request
router.post("/transfers", authorizeCommander, requestTransfer);

// assignments to personnel
router.post("/assignments/personnel", authorizeCommander, assignToPersonnel);

// read-only logs for own base
router.get("/logs", authorizeCommander, getBaseLogs);
// review transfer requests
router.post("/transfers/:id/review", authorizeCommander, reviewTransferRequest);
module.exports = router;
