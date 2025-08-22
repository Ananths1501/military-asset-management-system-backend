const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// === Logistics Officer Login ===
exports.loginLogistics = async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE username = ? AND role = 'logistics'",
      [username]
    );
    const user = rows[0];
    if (!user)
      return res
        .status(404)
        .json({ message: "User not found or not a logistics officer" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, role: user.role, base_id: user.base_id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === Add Personnel ===
exports.addPersonnel = async (req, res) => {
  const { name, ranks, service_number, assigned_unit } = req.body;
  const { base_id } = req.user;

  try {
    const [exists] = await pool.execute(
      "SELECT id FROM personnel WHERE service_number = ?",
      [service_number]
    );
    if (exists.length > 0)
      return res.status(400).json({ message: "Service number already exists" });

    await pool.execute(
      "INSERT INTO personnel (name, ranks, service_number, base_id, assigned_unit) VALUES (?, ?, ?, ?, ?)",
      [name, ranks, service_number, base_id, assigned_unit]
    );

    await pool.execute(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES (?, ?, 'add_personnel', ?, JSON_OBJECT('service_number', ?))",
      [req.user.id, req.user.role, name, service_number]
    );

    res.status(201).json({ message: "Personnel added successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === Update Personnel ===
exports.updatePersonnel = async (req, res) => {
  const { id } = req.params;
  const { name, ranks, assigned_unit } = req.body;
  const { base_id } = req.user;

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM personnel WHERE id = ? AND base_id = ?",
      [id, base_id]
    );
    if (rows.length === 0)
      return res
        .status(404)
        .json({ message: "Personnel not found in your base" });

    await pool.execute(
      "UPDATE personnel SET name = ?, ranks = ?, assigned_unit = ? WHERE id = ?",
      [name, ranks, assigned_unit, id]
    );

    await pool.execute(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES (?, ?, 'update_personnel', ?, JSON_OBJECT('personnel_id', ?))",
      [req.user.id, req.user.role, id, id]
    );

    res.json({ message: "Personnel updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === Delete Personnel ===
exports.deletePersonnel = async (req, res) => {
  const { id } = req.params;
  const { base_id } = req.user;

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM personnel WHERE id = ? AND base_id = ?",
      [id, base_id]
    );
    if (rows.length === 0)
      return res
        .status(404)
        .json({ message: "Personnel not found in your base" });

    await pool.execute("DELETE FROM personnel WHERE id = ?", [id]);

    await pool.execute(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES (?, ?, 'delete_personnel', ?, JSON_OBJECT('personnel_id', ?))",
      [req.user.id, req.user.role, id, id]
    );

    res.json({ message: "Personnel deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === View Assets in Base ===
exports.getBaseAssets = async (req, res) => {
  const { base_id } = req.user;

  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.serial_number, b.available_qty, b.assigned_qty
       FROM base_assets b
       JOIN assets a ON b.asset_id = a.id
       WHERE b.base_id = ?`,
      [base_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// === View Own Logs Only ===
exports.getMyLogs = async (req, res) => {
  try {
    const [logs] = await pool.execute(
      "SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
