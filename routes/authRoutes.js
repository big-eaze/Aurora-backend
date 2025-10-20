import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import fs from "fs";
import nodemailer from "nodemailer";
import { supabase } from "../config/supabaseClient.js";
import adminIds from "../defaultData/defaultAdmin.js";
import authMiddleware from "../middleware/authMiddleware.js";

// Load config
const config = JSON.parse(fs.readFileSync(new URL("../config/config.json", import.meta.url)));
const JWT_SECRET = config.JWT_SECRET;

const router = express.Router();

// ==========================
// 📧 Nodemailer transporter
// ==========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASS,
  },
});

// ==========================
// 🧍 Public Routes
// ==========================

// POST /signup
router.post(
  "/signup",
  [
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("username").notEmpty().withMessage("Username is required"),
    body("role").isIn(["admin", "staff", "student"]).withMessage("Invalid role"),
    body("email")
      .if(body("role").custom(role => role === "admin" || role === "staff"))
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email format"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.password) throw new Error("Passwords do not match");
      return true;
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      firstName,
      lastName,
      username,
      email,
      password,
      role,
      adminId,
      staffId,
      admissionNumber,
      class: staffClass,
      subject,
    } = req.body;

    try {
      // Role-based validation
      if (role === "admin" && !adminIds.some(admin => admin.adminId === adminId)) {
        return res.status(400).json({ message: "Invalid admin ID" });
      }

      if (role === "staff") {
        const { data: staffExists } = await supabase
          .from("Staff")
          .select("*")
          .eq("staffId", staffId)
          .single();
        if (!staffExists)
          return res.status(400).json({ message: "Staff ID not found in staff database" });
      }

      if (role === "student") {
        const { data: studentExists } = await supabase
          .from("Students")
          .select("*")
          .eq("admissionNumber", admissionNumber)
          .single();
        if (!studentExists)
          return res.status(400).json({ message: "Admission number not found in student database" });
      }

      // Uniqueness check
      const { data: existingUser } = await supabase
        .from("Users")
        .select("*")
        .or(`username.eq.${username},email.eq.${email}`)
        .maybeSingle();
      if (existingUser) return res.status(400).json({ message: "Username or email already exists" });

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user into Supabase
      const { data: newUser, error } = await supabase.from("Users").insert([
        {
          firstName,
          lastName,
          username,
          email: email || null,
          password: hashedPassword,
          role,
          adminId: role === "admin" ? adminId : null,
          staffId: role === "staff" ? staffId : null,
          admissionNumber: role === "student" ? admissionNumber : null,
          class: role === "staff" ? staffClass : null,
          subject: role === "staff" ? subject : null,
        },
      ]).select().single();

      if (error) throw error;

      // Create JWT
      const token = jwt.sign(
        {
          id: newUser.id,
          role: newUser.role,
          adminId: newUser.adminId,
          staffId: newUser.staffId,
          admissionNumber: newUser.admissionNumber,
          class: newUser.class,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.status(201).json({ message: "User registered successfully", user: newUser, token });
    } catch (error) {
      res.status(500).json({ message: "Server error during signup", error: error.message });
    }
  }
);

// POST /signin
router.post(
  "/signin",
  [body("username").notEmpty(), body("password").notEmpty()],
  async (req, res) => {
    const { username, password } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { data: user, error: userError } = await supabase
        .from("Users")
        .select("*")
        .eq("username", username)
        .single();

      if (userError || !user) return res.status(400).json({ message: "Invalid credentials" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          adminId: user.adminId,
          staffId: user.staffId,
          admissionNumber: user.admissionNumber,
          class: user.role === "student" ? user.class : null,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.status(200).json({
        message: "Login successful",
        token,
        role: user.role,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// POST /forgot-password
router.post("/forgot-password", [body("email").isEmail()], async (req, res) => {
  const { email } = req.body;
  try {
    const { data: user } = await supabase.from("Users").select("*").eq("email", email).single();
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await supabase.from("OTP").insert([{ email, otp, expiresAt }]);

    await transporter.sendMail({
      from: config.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP for password reset is: ${otp}. It expires in 30 minutes.`,
    });

    res.status(200).json({ message: "OTP sent to email" });
  } catch (error) {
    res.status(500).json({ message: "Error sending OTP", error: error.message });
  }
});

// POST /reset-password
router.post(
  "/reset-password",
  [
    body("email").isEmail(),
    body("otp").notEmpty(),
    body("newPassword").isLength({ min: 8 }),
    body("confirmNewPassword").custom((v, { req }) => {
      if (v !== req.body.newPassword) throw new Error("Passwords do not match");
      return true;
    }),
  ],
  async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
      const { data: otpRecord } = await supabase
        .from("OTP")
        .select("*")
        .eq("email", email)
        .eq("otp", otp)
        .single();

      if (!otpRecord) return res.status(400).json({ message: "Invalid OTP" });
      if (new Date() > new Date(otpRecord.expiresAt))
        return res.status(400).json({ message: "OTP has expired" });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await supabase.from("Users").update({ password: hashedPassword }).eq("email", email);
      await supabase.from("OTP").delete().eq("email", email);

      res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error resetting password", error: error.message });
    }
  }
);

// ==========================
// 🔒 Protected Routes
// ==========================
router.use(authMiddleware);

// GET /profile
router.get("/profile", async (req, res) => {
  try {
    const { data: user } = await supabase
      .from("Users")
      .select("*, password")
      .eq("id", req.user.id)
      .single();

    if (!user) return res.status(404).json({ message: "User not found" });
    delete user.password;

    if (user.role === "student" && user.admissionNumber) {
      const { data: student } = await supabase
        .from("Students")
        .select("class")
        .eq("admissionNumber", user.admissionNumber)
        .single();
      if (student) user.class = student.class;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Error fetching profile", error: error.message });
  }
});

// POST /change-password
router.post(
  "/change-password",
  [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 8 }),
    body("confirmNewPassword").custom((v, { req }) => {
      if (v !== req.body.newPassword) throw new Error("Passwords do not match");
      return true;
    }),
  ],
  async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
      const { data: user } = await supabase.from("Users").select("*").eq("id", req.user.id).single();
      if (!user) return res.status(404).json({ message: "User not found" });

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ message: "Incorrect current password" });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await supabase.from("Users").update({ password: hashedPassword }).eq("id", req.user.id);

      res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error changing password", error: error.message });
    }
  }
);

export default router;
