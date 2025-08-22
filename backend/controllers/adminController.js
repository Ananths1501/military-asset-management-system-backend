const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// 🔹 Helper: log every action
async function logAction(userId, role, action, target, details = {}) {
  await pool.query(
    "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES ($1, $2, $3, $4, $5)",
    [userId, role, action, target, JSON.stringify(details)]
  );
}

// ======================= ADMIN LOGIN =======================
async function loginAdmin(req, res) {
  const { username, password } = req.body;
  try {
  const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can login here" });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    await logAction(user.id, "admin", "login", "system", { username });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= BASE MANAGEMENT =======================
async function listBases(req, res) {
  try {
  const { rows } = await pool.query("SELECT * FROM bases");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function addBase(req, res) {
  const { name, location } = req.body;
  try {
    const { rows: exists } = await pool.query("SELECT id FROM bases WHERE name=$1", [name]);
    if (exists.length > 0) {
      return res.status(400).json({ message: "Base already exists" });
    }

    const result = await pool.query("INSERT INTO bases (name, location) VALUES ($1, $2) RETURNING id", [name, location]);

    await logAction(req.user.id, "admin", "create", "base", { baseId: result.insertId, name });
    res.status(201).json({ message: "Base created", baseId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateBase(req, res) {
  const { id } = req.params;
  const { name, location } = req.body;
  try {
  const { rows: exists } = await pool.query("SELECT id FROM bases WHERE id=$1", [id]);
  if (exists.length === 0) return res.status(404).json({ message: "Base not found" });

  await pool.query("UPDATE bases SET name=$1, location=$2 WHERE id=$3", [name, location, id]);

    await logAction(req.user.id, "admin", "update", "base", { baseId: id, name, location });
    res.json({ message: "Base updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteBase(req, res) {
  const { id } = req.params;
  try {
    const [exists] = await pool.execute("SELECT id FROM bases WHERE id=?", [id]);
    if (exists.length === 0) return res.status(404).json({ message: "Base not found" });

    await pool.execute("DELETE FROM bases WHERE id=?", [id]);

    await logAction(req.user.id, "admin", "delete", "base", { baseId: id });
    res.json({ message: "Base deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= USER MANAGEMENT =======================
async function addUser(req, res) {
  const { username, password, role, base_id } = req.body;
  try {
    if (role === "admin") {
      return res.status(400).json({ message: "Only one admin allowed" });
    }

    const { rows: exists } = await pool.query("SELECT id FROM users WHERE username=$1", [username]);
    if (exists.length > 0) return res.status(400).json({ message: "Username already exists" });

    if (base_id) {
      const { rows: base } = await pool.query("SELECT id FROM bases WHERE id=$1", [base_id]);
      if (base.length === 0) return res.status(400).json({ message: "Base does not exist" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, role, base_id) VALUES ($1, $2, $3, $4) RETURNING id",
      [username, hashed, role, base_id]
    );

    await logAction(req.user.id, "admin", "create", "user", { username, role, base_id });
    res.status(201).json({ message: "User created", userId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { username, role, base_id } = req.body;
  try {
    const { rows: exists } = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
    if (exists.length === 0) return res.status(404).json({ message: "User not found" });

    if (base_id) {
      const { rows: base } = await pool.query("SELECT id FROM bases WHERE id=$1", [base_id]);
      if (base.length === 0) return res.status(400).json({ message: "Base does not exist" });
    }

    await pool.query("UPDATE users SET username=$1, role=$2, base_id=$3 WHERE id=$4", [username, role, base_id, id]);

    await logAction(req.user.id, "admin", "update", "user", { userId: id, username, role, base_id });
    res.json({ message: "User updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteUser(req, res) {
  const { id } = req.params;
  try {
  const { rows: exists } = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
  if (exists.length === 0) return res.status(404).json({ message: "User not found" });

  await pool.query("DELETE FROM users WHERE id=$1", [id]);

    await logAction(req.user.id, "admin", "delete", "user", { userId: id });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getAllUsers(req, res) {
  try {
  const { rows } = await pool.query("SELECT id, username, role, base_id FROM users");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= ASSET MANAGEMENT =======================
async function listAssets(req, res) {
  try {
    const [rows] = await pool.execute("SELECT * FROM assets");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function addAsset(req, res) {
  const { name, serial_number, description } = req.body;
  try {
    const [exists] = await pool.execute("SELECT id FROM assets WHERE serial_number=?", [
      serial_number,
    ]);
    if (serial_number && exists.length > 0) {
      return res.status(400).json({ message: "Asset with this serial number already exists" });
    }

    const [result] = await pool.execute(
      "INSERT INTO assets (name, serial_number, description) VALUES (?, ?, ?)",
      [name, serial_number, description]
    );

    await logAction(req.user.id, "admin", "create", "asset", { assetId: result.insertId, name });
    res.status(201).json({ message: "Asset created", assetId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateAsset(req, res) {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const [exists] = await pool.execute("SELECT id FROM assets WHERE id=?", [id]);
    if (exists.length === 0) return res.status(404).json({ message: "Asset not found" });

    await pool.execute("UPDATE assets SET name=?, description=? WHERE id=?", [name, description, id]);

    await logAction(req.user.id, "admin", "update", "asset", { assetId: id, name });
    res.json({ message: "Asset updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteAsset(req, res) {
  const { id } = req.params;
  try {
    const [exists] = await pool.execute("SELECT id FROM assets WHERE id=?", [id]);
    if (exists.length === 0) return res.status(404).json({ message: "Asset not found" });

    await pool.execute("DELETE FROM assets WHERE id=?", [id]);

    await logAction(req.user.id, "admin", "delete", "asset", { assetId: id });
    res.json({ message: "Asset deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= INVENTORY =======================
async function getBaseInventory(req, res) {
  const { base_id } = req.query;
  try {
    const [base] = await pool.execute("SELECT id FROM bases WHERE id=?", [base_id]);
    if (base.length === 0) return res.status(404).json({ message: "Base not found" });

    const [rows] = await pool.execute(
      "SELECT b.id as base_id, a.name as asset_name, ba.available_qty, ba.assigned_qty FROM base_assets ba JOIN assets a ON ba.asset_id=a.id JOIN bases b ON ba.base_id=b.id WHERE ba.base_id=?",
      [base_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= PURCHASE =======================
async function purchaseAsset(req, res) {
  const { base_id, asset_id, quantity } = req.body;
  try {
    const [base] = await pool.execute("SELECT id FROM bases WHERE id=?", [base_id]);
    if (base.length === 0) return res.status(400).json({ message: "Base not found" });

    const [asset] = await pool.execute("SELECT id FROM assets WHERE id=?", [asset_id]);
    if (asset.length === 0) return res.status(400).json({ message: "Asset not found" });

    await pool.execute(
      "INSERT INTO purchases (base_id, asset_id, quantity, created_by) VALUES (?, ?, ?, ?)",
      [base_id, asset_id, quantity, req.user.id]
    );

    await pool.execute(
      `INSERT INTO base_assets (base_id, asset_id, available_qty) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE available_qty = available_qty + VALUES(available_qty)`,
      [base_id, asset_id, quantity]
    );

    await logAction(req.user.id, "admin", "purchase", "asset", { base_id, asset_id, quantity });
    res.status(201).json({ message: "Purchase recorded" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= TRANSFERS =======================
async function transferAsset(req, res) {
  const { from_base, to_base, asset_id, quantity } = req.body;
  try {
    const [from] = await pool.execute("SELECT id FROM bases WHERE id=?", [from_base]);
    const [to] = await pool.execute("SELECT id FROM bases WHERE id=?", [to_base]);
    if (from.length === 0 || to.length === 0) {
      return res.status(400).json({ message: "Invalid base(s)" });
    }

    const [stock] = await pool.execute(
      "SELECT available_qty FROM base_assets WHERE base_id=? AND asset_id=?",
      [from_base, asset_id]
    );
    if (stock.length === 0 || stock[0].available_qty < quantity) {
      return res.status(400).json({ message: "Not enough stock at source base" });
    }

    await pool.execute(
      "UPDATE base_assets SET available_qty = available_qty - ? WHERE base_id=? AND asset_id=?",
      [quantity, from_base, asset_id]
    );

    await pool.execute(
      `INSERT INTO base_assets (base_id, asset_id, available_qty) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE available_qty = available_qty + VALUES(available_qty)`,
      [to_base, asset_id, quantity]
    );

    await pool.execute(
      "INSERT INTO transfers (asset_id, from_base, to_base, quantity, created_by) VALUES (?, ?, ?, ?, ?)",
      [asset_id, from_base, to_base, quantity, req.user.id]
    );

    await logAction(req.user.id, "admin", "transfer", "asset", { asset_id, from_base, to_base, quantity });
    res.status(201).json({ message: "Transfer completed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= ASSIGNMENTS =======================
async function assignAsset(req, res) {
  const { base_id, asset_id, assignee_type, assignee_id, quantity } = req.body;
  try {
    const [base] = await pool.execute("SELECT id FROM bases WHERE id=?", [base_id]);
    if (base.length === 0) return res.status(400).json({ message: "Base not found" });

    const [stock] = await pool.execute(
      "SELECT available_qty FROM base_assets WHERE base_id=? AND asset_id=?",
      [base_id, asset_id]
    );
    if (stock.length === 0 || stock[0].available_qty < quantity) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    await pool.execute(
      "UPDATE base_assets SET available_qty = available_qty - ?, assigned_qty = assigned_qty + ? WHERE base_id=? AND asset_id=?",
      [quantity, quantity, base_id, asset_id]
    );

    await pool.execute(
      "INSERT INTO assignments (base_id, asset_id, assignee_type, assignee_user_id, assignee_personnel_id, quantity, assigned_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        base_id,
        asset_id,
        assignee_type,
        assignee_type === "user" ? assignee_id : null,
        assignee_type === "personnel" ? assignee_id : null,
        quantity,
        req.user.id,
      ]
    );

    await logAction(req.user.id, "admin", "assign", "asset", { base_id, asset_id, assignee_type, assignee_id, quantity });
    res.status(201).json({ message: "Asset assigned" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Return assigned asset back to base
async function returnAssignedAsset(req, res) {
  const { assignment_id } = req.body;
  try {
    const [assignment] = await pool.execute("SELECT * FROM assignments WHERE id=?", [assignment_id]);
    if (assignment.length === 0) return res.status(404).json({ message: "Assignment not found" });

    const row = assignment[0];

    // update base inventory
    await pool.execute(
      "UPDATE base_assets SET available_qty = available_qty + ?, assigned_qty = assigned_qty - ? WHERE base_id=? AND asset_id=?",
      [row.quantity, row.quantity, row.base_id, row.asset_id]
    );

    await pool.execute("DELETE FROM assignments WHERE id=?", [assignment_id]);

    await logAction(req.user.id, "admin", "return", "asset", { assignment_id, base_id: row.base_id, asset_id: row.asset_id, qty: row.quantity });
    res.json({ message: "Asset returned to base inventory" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ======================= AUDIT LOGS =======================
async function getAuditLogs(req, res) {
  try {
    const [logs] = await pool.execute("SELECT * FROM audit_logs ORDER BY created_at DESC");
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ===== ASSETS =====

// Update Asset
async function updateAsset(req, res){
  const { id } = req.params;
  const { name, serial_number, description } = req.body;
  try {
    // Check if asset exists
    const [asset] = await pool.query("SELECT * FROM assets WHERE id = ?", [id]);
    if (asset.length === 0) {
      return res.status(404).json({ message: "Asset not found" });
    }

    // Check for duplicate serial (if changed)
    if (serial_number) {
      const [dup] = await pool.query(
        "SELECT * FROM assets WHERE serial_number = ? AND id != ?",
        [serial_number, id]
      );
      if (dup.length > 0) {
        return res.status(400).json({ message: "Serial number already exists" });
      }
    }

    await pool.query(
      "UPDATE assets SET name = ?, serial_number = ?, description = ? WHERE id = ?",
      [name, serial_number, description, id]
    );

    await logAction(req.user.id, req.user.role, "update_asset", "assets", {
      asset_id: id,
      name,
      serial_number,
    });

    res.json({ message: "Asset updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete Asset (only if no inventory exists)
async function deleteAsset(req, res) {
  const { id } = req.params;
  try {
    const [asset] = await pool.query("SELECT * FROM assets WHERE id = ?", [id]);
    if (asset.length === 0) {
      return res.status(404).json({ message: "Asset not found" });
    }

    const [inv] = await pool.query(
      "SELECT * FROM base_assets WHERE asset_id = ? AND (available_qty > 0 OR assigned_qty > 0)",
      [id]
    );
    if (inv.length > 0) {
      return res.status(400).json({ message: "Cannot delete asset with stock in bases" });
    }

    await pool.query("DELETE FROM assets WHERE id = ?", [id]);

    await logAction(req.user.id, req.user.role, "delete_asset", "assets", {
      asset_id: id,
    });

    res.json({ message: "Asset deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===== BASES (with filters) =====
async function listBases(req, res) {
  const { name, location } = req.query;
  try {
    let sql = "SELECT * FROM bases WHERE 1=1";
    const params = [];

    if (name) {
      sql += " AND name LIKE ?";
      params.push(`%${name}%`);
    }
    if (location) {
      sql += " AND location LIKE ?";
      params.push(`%${location}%`);
    }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===== AUDIT LOGS (with filters) =====
async function getAuditLogs(req, res){
  const { user_id, base_id, asset_id, action } = req.query;
  try {
    let sql = "SELECT * FROM audit_logs WHERE 1=1";
    const params = [];

    if (user_id) {
      sql += " AND user_id = ?";
      params.push(user_id);
    }
    if (base_id) {
      sql += " AND JSON_EXTRACT(details, '$.base_id') = ?";
      params.push(base_id);
    }
    if (asset_id) {
      sql += " AND JSON_EXTRACT(details, '$.asset_id') = ?";
      params.push(asset_id);
    }
    if (action) {
      sql += " AND action = ?";
      params.push(action);
    }

    sql += " ORDER BY created_at DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// === APPROVE/REJECT PURCHASE ===
async function approvePurchase(req, res)  {
  const { id } = req.params;
  const { approve } = req.body; // true/false
  const adminId = req.user.id;

  try {
    const [[purchase]] = await pool.query("SELECT * FROM purchases WHERE id=?", [id]);
    if (!purchase) return res.status(404).json({ message: "Purchase not found" });
    if (purchase.status !== "pending") return res.status(400).json({ message: "Already processed" });

    if (!approve) {
      await pool.query("UPDATE purchases SET status='rejected', approved_by=? WHERE id=?", [adminId, id]);
      return res.json({ message: "Purchase rejected" });
    }

    // Approve & update inventory
    await pool.query("UPDATE purchases SET status='approved', approved_by=? WHERE id=?", [adminId, id]);

    await pool.query(
      `INSERT INTO base_assets (base_id, asset_id, available_qty)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE available_qty = available_qty + VALUES(available_qty)`,
      [purchase.base_id, purchase.asset_id, purchase.quantity]
    );

    await pool.query(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES (?, 'admin', 'approve_purchase', ?, JSON_OBJECT('purchase_id', ?, 'quantity', ?))",
      [adminId, `base:${purchase.base_id}`, purchase.id, purchase.quantity]
    );

    res.json({ message: "Purchase approved and stock updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === APPROVE/REJECT TRANSFER ===
async  function approveTransfer(req, res) {
  const { id } = req.params;
  const { approve } = req.body; // true/false
  const adminId = req.user.id;

  try {
    const [[transfer]] = await pool.query("SELECT * FROM transfers WHERE id=?", [id]);
    if (!transfer) return res.status(404).json({ message: "Transfer not found" });
    if (transfer.status !== "pending") return res.status(400).json({ message: "Already processed" });

    if (!approve) {
      await pool.query("UPDATE transfers SET status='rejected', approved_by=? WHERE id=?", [adminId, id]);
      return res.json({ message: "Transfer rejected" });
    }

    // Check stock in from_base
    const [[stock]] = await pool.query(
      "SELECT available_qty FROM base_assets WHERE base_id=? AND asset_id=?",
      [transfer.from_base, transfer.asset_id]
    );
    if (!stock || stock.available_qty < transfer.quantity)
      return res.status(400).json({ message: "Not enough stock in source base" });

    // Deduct from source
    await pool.query(
      "UPDATE base_assets SET available_qty=available_qty-? WHERE base_id=? AND asset_id=?",
      [transfer.quantity, transfer.from_base, transfer.asset_id]
    );

    // Add to destination
    await pool.query(
      `INSERT INTO base_assets (base_id, asset_id, available_qty)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE available_qty = available_qty + VALUES(available_qty)`,
      [transfer.to_base, transfer.asset_id, transfer.quantity]
    );

    await pool.query("UPDATE transfers SET status='approved', approved_by=? WHERE id=?", [adminId, id]);

    await pool.query(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES (?, 'admin', 'approve_transfer', ?, JSON_OBJECT('transfer_id', ?, 'quantity', ?))",
      [adminId, `transfer:${transfer.id}`, transfer.id, transfer.quantity]
    );

    res.json({ message: "Transfer approved and executed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// ===== REVIEW TRANSFER REQUEST =====
async function reviewTransfer(req, res) {
  const { id } = req.params; // transfer id
  const { decision } = req.body; // "approved" or "rejected"
  const commander = req.user;

  try {
    const [rows] = await pool.execute("SELECT * FROM transfers WHERE id=?", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Transfer request not found" });

    const transfer = rows[0];
    if (transfer.status !== "pending") return res.status(400).json({ message: "Already processed" });

    if (transfer.from_base !== commander.base_id) {
      return res.status(403).json({ message: "Only from_base commander can approve" });
    }

    if (decision === "approved") {
      // check stock again
      const [inv] = await pool.execute(
        "SELECT available_qty FROM base_assets WHERE base_id=? AND asset_id=?",
        [transfer.from_base, transfer.asset_id]
      );
      if (inv.length === 0 || inv[0].available_qty < transfer.quantity) {
        return res.status(400).json({ message: "Not enough stock at from_base" });
      }

      // reduce stock from from_base
      await pool.execute(
        "UPDATE base_assets SET available_qty = available_qty - ? WHERE base_id=? AND asset_id=?",
        [transfer.quantity, transfer.from_base, transfer.asset_id]
      );

      // add stock to to_base
      await pool.execute(
        `INSERT INTO base_assets (base_id, asset_id, available_qty, assigned_qty)
         VALUES (?,?,?,0)
         ON DUPLICATE KEY UPDATE available_qty = available_qty + VALUES(available_qty)`,
        [transfer.to_base, transfer.asset_id, transfer.quantity]
      );

      await pool.execute("UPDATE transfers SET status='approved' WHERE id=?", [id]);

      await logAction(commander.id, "commander", "approve_transfer", `Transfer req #${id} approved`, transfer);
      res.json({ message: "Transfer approved and executed" });
    } else {
      await pool.execute("UPDATE transfers SET status='rejected' WHERE id=?", [id]);
      await logAction(commander.id, "commander", "reject_transfer", `Transfer req #${id} rejected`, transfer);
      res.json({ message: "Transfer rejected" });
    }
  } catch (err) {
    console.error("reviewTransfer error:", err);
    res.status(500).json({ message: "Server error" });
  }
}


module.exports = {
  // Auth
  loginAdmin,
  // Bases
  listBases, addBase, updateBase, deleteBase,
  // Users
  addUser, updateUser, deleteUser, getAllUsers,
  // Assets
  listAssets, addAsset, updateAsset, deleteAsset,
  // Inventory
  getBaseInventory,
  // Flows
  purchaseAsset, transferAsset, assignAsset, returnAssignedAsset,
  // Logs
  getAuditLogs,

  approvePurchase,approveTransfer,
  // Review transfer requests
  reviewTransfer
};
