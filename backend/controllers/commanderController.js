// controllers/commanderController.js
const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
// local helper to record every action
async function logAction(userId, role, action, target, details = {}) {
  await pool.execute(
    "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES (?, ?, ?, ?, ?)",
    [userId, role, action, target, JSON.stringify(details)]
  );
}



// ================= LOGIN =================
exports.loginCommander = async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE username = ?", [username]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "commander") {
      return res.status(403).json({ message: "Only commanders can log in here" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, base_id: user.base_id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    await logAction(user.id, "commander", "login", `Commander ${username} logged in`);

    res.json({ token });
  } catch (err) {
    console.error("Commander login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
}
/**
 * UTIL: fetch + assert base ownership for commander
 */
async function assertCommanderBase(req) {
  const commanderBaseId = req.user.base_id;
  if (!commanderBaseId) {
    const error = new Error("Commander must be assigned to a base");
    error.status = 403;
    throw error;
  }
  // base exists?
  const [b] = await pool.execute("SELECT id FROM bases WHERE id=?", [commanderBaseId]);
  if (b.length === 0) {
    const error = new Error("Assigned base not found");
    error.status = 400;
    throw error;
  }
  return commanderBaseId;
}

/* =========================
   2.2.1  Manage Logistics Officers (CRUD, scoped to commander's base)
   ========================= */

exports.listLogistics = async (req, res) => {
  try {
    const baseId = await assertCommanderBase(req);
    const [rows] = await pool.execute(
      "SELECT id, username, role, base_id, is_active FROM users WHERE role='logistics' AND base_id=?",
      [baseId]
    );
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.addLogistics = async (req, res) => {
  const { username, password } = req.body;
  try {
    const baseId = await assertCommanderBase(req);

    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required" });
    }

    const [dup] = await pool.execute("SELECT id FROM users WHERE username=?", [username]);
    if (dup.length > 0) return res.status(400).json({ message: "Username already exists" });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      "INSERT INTO users (username, password_hash, role, base_id, is_active) VALUES (?, ?, 'logistics', ?, 1)",
      [username, hash, baseId]
    );

    await logAction(req.user.id, "commander", "create_user", "users", {
      created_user_id: result.insertId,
      role: "logistics",
      base_id: baseId,
    });

    res.status(201).json({ message: "Logistics officer created", userId: result.insertId });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.updateLogistics = async (req, res) => {
  const { id } = req.params;
  const { username, is_active } = req.body;
  try {
    const baseId = await assertCommanderBase(req);

    const [u] = await pool.execute(
      "SELECT id, base_id, role FROM users WHERE id=? AND role='logistics'",
      [id]
    );
    if (u.length === 0) return res.status(404).json({ message: "Logistics user not found" });
    if (u[0].base_id !== baseId)
      return res.status(403).json({ message: "User does not belong to your base" });

    if (username) {
      const [dup] = await pool.execute(
        "SELECT id FROM users WHERE username=? AND id<>?",
        [username, id]
      );
      if (dup.length > 0) return res.status(400).json({ message: "Username already taken" });
    }

    await pool.execute(
      "UPDATE users SET username = COALESCE(?, username), is_active = COALESCE(?, is_active) WHERE id=?",
      [username || null, typeof is_active === "number" ? is_active : null, id]
    );

    await logAction(req.user.id, "commander", "update_user", "users", {
      updated_user_id: id,
      base_id: baseId,
    });

    res.json({ message: "Logistics officer updated" });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.deleteLogistics = async (req, res) => {
  const { id } = req.params;
  try {
    const baseId = await assertCommanderBase(req);
    const [u] = await pool.execute(
      "SELECT id, base_id, role FROM users WHERE id=? AND role='logistics'",
      [id]
    );
    if (u.length === 0) return res.status(404).json({ message: "Logistics user not found" });
    if (u[0].base_id !== baseId)
      return res.status(403).json({ message: "User does not belong to your base" });

    await pool.execute("DELETE FROM users WHERE id=?", [id]);

    await logAction(req.user.id, "commander", "delete_user", "users", {
      deleted_user_id: id,
      base_id: baseId,
    });

    res.json({ message: "Logistics officer deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};



// === CREATE PURCHASE REQUEST ===
exports.requestPurchase = async (req, res) => {
  const { base_id, asset_id, quantity } = req.body;
  const commanderId = req.user.id;

  try {
    // Ensure commander belongs to base
    const [[commander]] = await pool.query("SELECT base_id FROM users WHERE id=?", [commanderId]);
    if (!commander || commander.base_id !== base_id)
      return res.status(403).json({ message: "Commander not assigned to this base" });

    await pool.query(
      "INSERT INTO purchases (base_id, asset_id, quantity, status, created_by) VALUES (?, ?, ?, 'pending', ?)",
      [base_id, asset_id, quantity, commanderId]
    );

    res.status(201).json({ message: "Purchase request submitted (pending admin approval)" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === CREATE TRANSFER REQUEST ===
exports.requestTransfer = async (req, res) => {
  const { from_base, asset_id, quantity } = req.body;
  const commanderId = req.user.id;
  const to_base = req.user.base_id; // always the commander's own base

  try {
    // Ensure commander's base exists
    if (!to_base) return res.status(403).json({ message: "Commander must belong to a base" });

    // Check from_base exists
    const [fromBaseRows] = await pool.query("SELECT id FROM bases WHERE id=?", [from_base]);
    if (fromBaseRows.length === 0) {
      return res.status(404).json({ message: "Source base not found" });
    }

    // Insert as pending transfer request
    const [result] = await pool.query(
      "INSERT INTO transfer_requests (asset_id, from_base, to_base, quantity, status, requested_by) VALUES (?, ?, ?, ?, 'requested', ?)",
      [asset_id, from_base, to_base, quantity, commanderId]
    );

    await logAction(commanderId, "commander", "request_transfer", "transfer_requests", {
      request_id: result.insertId,
      from_base,
      to_base,
      asset_id,
      quantity,
    });

    res.status(201).json({ message: "Transfer request submitted (awaiting from_base commander approval)", request_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ================= APPROVE TRANSFER =================

exports.reviewTransferRequest = async (req, res) => {
  const { id } = req.params;
  const { decision } = req.body; // "approve" | "reject"
  const approverId = req.user.id;
  const approverBase = req.user.base_id;

  try {
    const [rows] = await pool.execute("SELECT * FROM transfer_requests WHERE id=?", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Transfer request not found" });
    const transfer = rows[0];

    // Only the commander of from_base OR admin can approve
    if (req.user.role !== "admin" && transfer.from_base !== approverBase) {
      return res.status(403).json({ message: "You cannot approve transfers not from your base" });
    }

    if (transfer.status !== "requested") {
      return res.status(400).json({ message: `Transfer already ${transfer.status}` });
    }

    if (decision === "reject") {
      await pool.execute("UPDATE transfer_requests SET status='rejected', approved_by=? WHERE id=?", [approverId, id]);
      await logAction(approverId, req.user.role, "reject_transfer", "transfer_requests", { id, from_base: transfer.from_base, to_base: transfer.to_base });
      return res.json({ message: "Transfer request rejected" });
    }

    // ✅ Approval path
    // check stock in from_base
    const [inv] = await pool.execute(
      "SELECT available_qty FROM base_assets WHERE base_id=? AND asset_id=?",
      [transfer.from_base, transfer.asset_id]
    );
    if (inv.length === 0 || inv[0].available_qty < transfer.quantity) {
      return res.status(400).json({ message: "Insufficient stock in source base" });
    }

    // transaction: deduct from from_base, add to to_base
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE base_assets SET available_qty=available_qty-? WHERE base_id=? AND asset_id=?",
        [transfer.quantity, transfer.from_base, transfer.asset_id]
      );

      await conn.execute(
        "INSERT INTO base_assets (base_id, asset_id, available_qty, assigned_qty) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE available_qty=available_qty+?",
        [transfer.to_base, transfer.asset_id, transfer.quantity, transfer.quantity]
      );

      await conn.execute(
        "UPDATE transfer_requests SET status='completed', approved_by=? WHERE id=?",
        [approverId, id]
      );

      await conn.commit();
      await conn.release();

      await logAction(approverId, req.user.role, "approve_transfer", "transfer_requests", {
        id,
        from_base: transfer.from_base,
        to_base: transfer.to_base,
        asset_id: transfer.asset_id,
        quantity: transfer.quantity,
      });

      res.json({ message: "Transfer approved and executed" });
    } catch (err) {
      await conn.rollback();
      await conn.release();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   2.2.5  Assign Assets to personnel (within their base)
   ========================= */

exports.assignToPersonnel = async (req, res) => {
  const { personnel_id, asset_id, quantity } = req.body;
  const commanderBaseId = await assertCommanderBase(req);

  // transaction to safely move stock
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // validate personnel belongs to base
    const [p] = await conn.execute(
      "SELECT id, base_id, is_active FROM personnel WHERE id=? FOR UPDATE",
      [personnel_id]
    );
    if (p.length === 0) {
      await conn.release();
      return res.status(404).json({ message: "Personnel not found" });
    }
    if (p[0].base_id !== commanderBaseId) {
      await conn.release();
      return res.status(403).json({ message: "Personnel not in your base" });
    }
    if (p[0].is_active !== 1) {
      await conn.release();
      return res.status(400).json({ message: "Personnel is not active" });
    }

    // check stock
    const [stock] = await conn.execute(
      "SELECT available_qty FROM base_assets WHERE base_id=? AND asset_id=? FOR UPDATE",
      [commanderBaseId, asset_id]
    );
    const available = stock[0]?.available_qty || 0;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      await conn.release();
      return res.status(400).json({ message: "Quantity must be positive integer" });
    }
    if (available < quantity) {
      await conn.release();
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // move stock
    await conn.execute(
      "UPDATE base_assets SET available_qty=available_qty-?, assigned_qty=assigned_qty+? WHERE base_id=? AND asset_id=?",
      [quantity, quantity, commanderBaseId, asset_id]
    );
    await conn.execute(
      "INSERT INTO assignments (base_id, asset_id, assignee_type, assignee_user_id, assignee_personnel_id, quantity, assigned_by) VALUES (?, ?, 'personnel', NULL, ?, ?, ?)",
      [commanderBaseId, asset_id, personnel_id, quantity, req.user.id]
    );

    await logAction(req.user.id, "commander", "assign_asset", "assignments", {
      base_id: commanderBaseId,
      asset_id,
      personnel_id,
      quantity,
    });

    await conn.commit();
    await conn.release();
    res.status(201).json({ message: "Asset assigned to personnel" });
  } catch (err) {
    try { await conn.rollback(); await conn.release(); } catch {}
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   2.2.6  View Audit Logs for commander base only (read-only)
   ========================= */

exports.getBaseLogs = async (req, res) => {
  try {
    const baseId = await assertCommanderBase(req);

    // filter by base_id in JSON details
    const [rows] = await pool.execute(
      "SELECT * FROM audit_logs WHERE JSON_EXTRACT(details, '$.base_id') = ? OR JSON_EXTRACT(details, '$.from_base') = ? OR JSON_EXTRACT(details, '$.to_base') = ? ORDER BY created_at DESC",
      [baseId, baseId, baseId]
    );

    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};
