const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// === Logistics Officer Login ===
exports.loginLogistics = async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND role = 'logistics'",
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
    const { rows: exists } = await pool.query(
      "SELECT id FROM personnel WHERE service_number = $1",
      [service_number]
    );
    if (exists.length > 0)
      return res.status(400).json({ message: "Service number already exists" });

    await pool.query(
      "INSERT INTO personnel (name, ranks, service_number, base_id, assigned_unit) VALUES ($1, $2, $3, $4, $5)",
      [name, ranks, service_number, base_id, assigned_unit]
    );

    await pool.query(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES ($1, $2, 'add_personnel', $3, $4)",
      [req.user.id, req.user.role, name, JSON.stringify({ service_number })]
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
    const { rows } = await pool.query(
      "SELECT * FROM personnel WHERE id = $1 AND base_id = $2",
      [id, base_id]
    );
    if (rows.length === 0)
      return res
        .status(404)
        .json({ message: "Personnel not found in your base" });

    await pool.query(
      "UPDATE personnel SET name = $1, ranks = $2, assigned_unit = $3 WHERE id = $4",
      [name, ranks, assigned_unit, id]
    );

    await pool.query(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES ($1, $2, 'update_personnel', $3, $4)",
      [req.user.id, req.user.role, id, JSON.stringify({ personnel_id: id })]
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
    const { rows } = await pool.query(
      "SELECT * FROM personnel WHERE id = $1 AND base_id = $2",
      [id, base_id]
    );
    if (rows.length === 0)
      return res
        .status(404)
        .json({ message: "Personnel not found in your base" });

  await pool.query("DELETE FROM personnel WHERE id = $1", [id]);

    await pool.query(
      "INSERT INTO audit_logs (user_id, role, action, target, details) VALUES ($1, $2, 'delete_personnel', $3, $4)",
      [req.user.id, req.user.role, id, JSON.stringify({ personnel_id: id })]
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
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.serial_number, b.available_qty, b.assigned_qty
       FROM base_assets b
       JOIN assets a ON b.asset_id = a.id
       WHERE b.base_id = $1`,
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
    const { rows: logs } = await pool.query(
      "SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
