import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();

router.use(authMiddleware);

// ✅ Utility function to calculate attendance rates
const calculateRates = (records) => {
  const totalDays = records.length;
  const presentDays = records.filter((r) => r.status === "present").length;
  const absentDays = records.filter((r) => r.status === "absent").length;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weeklyRecords = records.filter((r) => new Date(r.date) >= oneWeekAgo);
  const weeklyPresent = weeklyRecords.filter((r) => r.status === "present").length;

  const weeklyRate = weeklyRecords.length > 0 ? (weeklyPresent / weeklyRecords.length) * 100 : 0;
  const overallRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

  return {
    totalDays,
    presentDays,
    absentDays,
    weeklyAttendanceRate: `${weeklyRate.toFixed(0)}%`,
    overallAttendanceRate: `${overallRate.toFixed(0)}%`,
  };
};

// ✅ GET all students’ attendance summary
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from("StudentAttendances")
      .select("*");

    if (attendanceError) throw attendanceError;

    const { data: students, error: studentError } = await supabase
      .from("Students")
      .select("admissionNumber, name, class");

    if (studentError) throw studentError;

    const enrichedData = students.map((student) => {
      const studentRecords = attendanceRecords.filter(
        (r) => r.admissionNumber === student.admissionNumber
      );
      const rates = calculateRates(studentRecords);
      return { studentDetails: student, ...rates };
    });

    res.status(200).json({ studentsAttendance: enrichedData });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching student attendance data",
      error: error.message,
    });
  }
});

// ✅ GET one student's attendance
router.get("/:admissionNumber", requireRole("admin", "student"), async (req, res) => {
  const { admissionNumber } = req.params;
  try {
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from("StudentAttendances")
      .select("*")
      .eq("admissionNumber", admissionNumber);

    if (attendanceError) throw attendanceError;

    if (!attendanceRecords?.length) {
      return res.status(404).json({ message: "No attendance data found for this student." });
    }

    const { data: studentDetails, error: studentError } = await supabase
      .from("Students")
      .select("admissionNumber, name, class, gender, age, parentPhone")
      .eq("admissionNumber", admissionNumber)
      .single();

    if (studentError) throw studentError;

    const rates = calculateRates(attendanceRecords);

    res.status(200).json({
      studentDetails,
      ...rates,
      attendanceRecords,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching attendance data", error: error.message });
  }
});

// POST /student-attendance
router.post("/", async (req, res) => {
  try {
    const { admissionNumber, date, status } = req.body;

    if (!admissionNumber || !date || !status) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if the student exists
    const { data: student, error: studentError } = await supabase
      .from("Students")
      .select("*")
      .eq("admissionNumber", admissionNumber)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Optional: check if already marked for this date
    const { data: existing, error: checkError } = await supabase
      .from("StudentAttendances")
      .select("*")
      .eq("admissionNumber", admissionNumber)
      .eq("date", date)
      .single();

    if (existing) {
      return res
        .status(400)
        .json({ message: "Attendance already marked for this student on this date" });
    }

    // Insert new attendance record
    const { data, error } = await supabase
      .from("StudentAttendances")
      .insert([
        {
          admissionNumber,
          date,
          status,
        },
      ])
      .select();

    if (error) throw error;

    res.status(201).json({ message: "Attendance recorded successfully", data });
  } catch (err) {
    console.error("Error adding attendance:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
