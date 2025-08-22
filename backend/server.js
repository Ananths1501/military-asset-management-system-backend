const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const adminRoutes = require("./routes/adminRoutes");
const commanderRoutes = require("./routes/commanderRoutes");
const logisticsRoutes = require("./routes/logisticsRoutes");
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/admin", adminRoutes);
app.use("/api/commander", commanderRoutes);
app.use("/api/logistics", logisticsRoutes);
// Health check
app.get("/", (req, res) => {
  res.send("MAMS API is running...");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

const PORT = process.env.PORT || 7373;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
