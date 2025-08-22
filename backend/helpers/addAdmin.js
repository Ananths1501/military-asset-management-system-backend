const bcrypt = require("bcryptjs");
const pool = require("../config/db.js");

async function addAdmin() {
  const username = "admin";      // 🔹 Change if needed
  const password = "admin123";   // 🔹 Change to strong password
  const role = "admin";

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert admin into DB
    await pool.execute(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, hashedPassword, role]
    );

    console.log("✅ Admin user created successfully!");
    process.exit();
  } catch (err) {
    console.error("❌ Error inserting admin:", err.message);
    process.exit(1);
  }
}

addAdmin();
