import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// 🧮 Utility: Calculate grade
const calculateGrade = (score) => {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
};

// 🟢 GET all results (admin only)
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { expand } = req.query;

    // Fetch results from Supabase
    const { data: results, error } = await supabase.from("Results").select("*");
    if (error) throw error;

    // Optionally expand student info (if you still have a Students table in Supabase)
    let expandedResults = results;
    if (expand === "student") {
      const { data: students, error: studentError } = await supabase.from("Students").select("*");
      if (studentError) throw studentError;

      expandedResults = results.map((result) => {
        const student = students.find((s) => s.admissionNumber === result.admissionNumber);
        return { ...result, student };
      });
    }

    // Process results (calculate performance + grades)
    const processedResults = expandedResults.map((result) => {
      const subjects = result.subjects || [];
      const totalScore = subjects.reduce((sum, subj) => sum + Number(subj.score || 0), 0);
      const maxScore = subjects.length * 100;
      const performance = Math.round((totalScore / maxScore) * 100) || 0;

      const gradedSubjects = subjects.map((subject) => ({
        ...subject,
        name: subject.name.charAt(0).toUpperCase() + subject.name.slice(1).toLowerCase(),
        grade: calculateGrade(Number(subject.score)),
      }));

      return {
        ...result,
        subjects: gradedSubjects,
        academicPerformance: `${performance}%`,
      };
    });

    res.status(200).json({
      totalResults: processedResults.length,
      results: processedResults,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching results", error: error.message });
  }
});

// 🟡 GET specific student's result
router.get("/:admissionNumber", requireRole("student"), async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    // Ensure student can only view their own result
    if (req.user.role !== "student" || req.user.admissionNumber !== admissionNumber) {
      return res
        .status(403)
        .json({ message: "Access denied. You can only view your own result." });
    }

    const { data: result, error } = await supabase
      .from("Results")
      .select("*")
      .eq("admissionNumber", admissionNumber)
      .single();

    if (error && error.code === "PGRST116") {
      return res.status(404).json({ message: "Result not found for this admission number." });
    }
    if (error) throw error;

    const subjects = result.subjects || [];
    const totalScore = subjects.reduce((sum, s) => sum + Number(s.score || 0), 0);
    const maxScore = subjects.length * 100;
    const performance = Math.round((totalScore / maxScore) * 100) || 0;

    const gradedSubjects = subjects.map((s) => ({
      ...s,
      grade: calculateGrade(Number(s.score)),
    }));

    res.status(200).json({
      ...result,
      academicPerformance: `${performance}%`,
      subjects: gradedSubjects,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching result", error: error.message });
  }
});

// 🟠 POST add a new result (admin only)
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { admissionNumber, subjects } = req.body;

    if (!admissionNumber || !subjects) {
      return res
        .status(400)
        .json({ message: "Admission number and subjects are required." });
    }

    // Format and grade subjects
    const formattedSubjects = subjects.map((subject) => ({
      ...subject,
      name: subject.name.charAt(0).toUpperCase() + subject.name.slice(1).toLowerCase(),
      grade: calculateGrade(Number(subject.score)),
    }));

    const totalScore = formattedSubjects.reduce(
      (sum, s) => sum + Number(s.score || 0),
      0
    );
    const maxScore = formattedSubjects.length * 100;
    const performance = Math.round((totalScore / maxScore) * 100) || 0;

    const { data, error } = await supabase
      .from("Results")
      .insert([
        {
          admissionNumber,
          subjects: formattedSubjects,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Fetch student details (if Students table exists)
    const { data: student } = await supabase
      .from("Students")
      .select("name, class, admissionNumber")
      .eq("admissionNumber", admissionNumber)
      .single();

    res.status(201).json({
      ...data,
      student: student || { message: "Student not found" },
      academicPerformance: `${performance}%`,
    });
  } catch (error) {
    res.status(400).json({ message: "Error adding result", error: error.message });
  }
});

// 🔴 DELETE a result by ID
router.delete("/:id", requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase.from("Results").delete().eq("id", id);
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Result not found" });
    }

    res.status(200).json({ message: "Result deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting result", error: error.message });
  }
});

export default router;
