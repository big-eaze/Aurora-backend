import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware); // protect all routes

// @route   GET /students
// @desc    Get all student data along with total count
// @access  Private (admin only)
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { data: students, error } = await supabase.from("Students").select("*");

    if (error) throw error;

    res.status(200).json({
      totalStudents: students.length,
      students,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching students", error: error.message });
  }
});

// @route   GET /students/:class
// @desc    Get all students for a specific class
// @access  Private (admin, staff)
router.get("/:class", requireRole("admin", "staff"), async (req, res) => {
  try {
    const { class: className } = req.params;

    const { data: students, error } = await supabase
      .from("Students")
      .select("*")
      .eq("class", className);

    if (error) throw error;

    if (!students || students.length === 0) {
      return res.status(404).json({ message: `No students found for class ${className}.` });
    }

    res.status(200).json({
      totalStudents: students.length,
      students,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching students for the class", error: error.message });
  }
});

// @route   POST /students
// @desc    Add a new student
// @access  Private (admin only)
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const {
      admissionNumber,
      name,
      class: className,
      gender,
      age,
      parentPhone,
    } = req.body;

    // Validate required fields
    if (!admissionNumber || !name || !className) {
      return res
        .status(400)
        .json({ message: "admissionNumber, name, and class are required" });
    }

    // Prepare clean data
    const newStudent = {
      admissionNumber: admissionNumber.trim(),
      name: name.trim(),
      ["class"]: className.trim(),
      gender: gender || null,
      age: age ? Number(age) : null,
      parentPhone: parentPhone || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log("🧩 Inserting student:", newStudent);

    // Insert into Supabase
    const { data, error } = await supabase.from("Students").insert([newStudent]).select();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return res.status(400).json({ message: "Supabase insert failed", error: error.message });
    }

    res.status(201).json({ message: "Student added successfully", student: data[0] });
  } catch (error) {
    console.error("❌ Error adding student:", error);
    res.status(400).json({ message: "Error adding student", error: error.message });
  }
});


// @route   DELETE /students/:admissionNumber
// @desc    Delete a student and related records
// @access  Private (admin only)
router.delete("/:admissionNumber", requireRole("admin"), async (req, res) => {
  const { admissionNumber } = req.params;

  try {
    // Delete related records first
    await supabase.from("Results").delete().eq("admissionNumber", admissionNumber);
    await supabase.from("StudentAttendance").delete().eq("admissionNumber", admissionNumber);

    // Delete student record
    const { data, error } = await supabase
      .from("Students")
      .delete()
      .eq("admissionNumber", admissionNumber)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting student", error: error.message });
  }
});

export default router;