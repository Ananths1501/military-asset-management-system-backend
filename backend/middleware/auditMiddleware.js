const pool = require("../config/db.js");
export async function logAction(user, action, target, details = {}) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, role, action, target, details)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, user.role, action, target, JSON.stringify(details)]
    );
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}
