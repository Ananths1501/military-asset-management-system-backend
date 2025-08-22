const express = require("express");
const {
  // Auth
  loginAdmin,
  // Bases
  listBases,addBase,updateBase,deleteBase,
  // Users
  addUser,updateUser,deleteUser,getAllUsers,
  // Assets
  listAssets,addAsset,updateAsset,deleteAsset,
  // Inventory
  getBaseInventory,
  // Flows
  purchaseAsset,transferAsset,assignAsset,returnAssignedAsset,
  // Logs
  getAuditLogs,
  // Purchase approvals
  approvePurchase,approveTransfer,
} = require("../controllers/adminController");

const { authorizeAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// ======================= AUTH =======================
router.post("/login", loginAdmin);

// ======================= BASES =======================
router.get("/bases", authorizeAdmin, listBases);
router.post("/bases", authorizeAdmin, addBase);
router.put("/bases/:id", authorizeAdmin, updateBase);
router.delete("/bases/:id", authorizeAdmin, deleteBase);

// ======================= USERS =======================
router.get("/users", authorizeAdmin, getAllUsers);
router.post("/users", authorizeAdmin, addUser);
router.put("/users/:id", authorizeAdmin, updateUser);
router.delete("/users/:id", authorizeAdmin, deleteUser);

// ======================= ASSETS =======================
router.get("/assets", authorizeAdmin, listAssets);
router.post("/assets", authorizeAdmin, addAsset);
router.put("/assets/:id", authorizeAdmin, updateAsset);
router.delete("/assets/:id", authorizeAdmin, deleteAsset);

// ======================= INVENTORY =======================
router.get("/inventory", authorizeAdmin, getBaseInventory);

// ======================= FLOWS =======================
router.post("/purchases", authorizeAdmin, purchaseAsset);
router.post("/transfers", authorizeAdmin, transferAsset);
router.post("/assignments", authorizeAdmin, assignAsset);
router.post("/assignments/return", authorizeAdmin, returnAssignedAsset);

router.post("/purchases/:id/approve", authorizeAdmin, approvePurchase);
// approve transfer
router.post("/transfers/:id/approve", authorizeAdmin, approveTransfer);
// ======================= AUDIT LOGS =======================
router.get("/logs", authorizeAdmin, getAuditLogs);

module.exports = router;
