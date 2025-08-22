// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

function authorizeAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    req.user = decoded; // { id, role }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function authorizeCommander(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "commander") {
      return res.status(403).json({ message: "Commanders only" });
    }
    if (!decoded.base_id) {
      return res.status(403).json({ message: "Commander base context missing" });
    }
    req.user = decoded; // { id, role, base_id }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function authorizeLogistics(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "logistics") {
      return res.status(403).json({ message: "Logistics officers only" });
    }
    if (!decoded.base_id) {
      return res.status(403).json({ message: "Logistics base context missing" });
    }
    req.user = decoded; // { id, role, base_id }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = { authorizeAdmin, authorizeCommander, authorizeLogistics };
