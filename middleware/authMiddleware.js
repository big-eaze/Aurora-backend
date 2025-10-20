import jwt from "jsonwebtoken";
import fs from "fs";

// ✅ Read from process.env
const config = JSON.parse(fs.readFileSync(new URL("../config/config.json", import.meta.url)));
const JWT_SECRET = config.JWT_SECRET;


const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next(); // Continue
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default authMiddleware;
