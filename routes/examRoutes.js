import express from "express";
import { supabase } from "../config/supabaseClient.js";
import { getUpcomingExams } from "../utils/upcomingExams.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// Utility function to format time with AM/PM
const formatTimeWithMeridian = (time) => {
  const [hour, minute] = time.split(":").map(Number);
  if (hour >= 1 && hour <= 11) return `${time} AM`;
  if (hour === 12) return `${time} PM`;
  if (hour >= 13 && hour <= 23) return `${hour - 12}:${minute.toString().padStart(2, "0")} PM`;
  throw new Error("Invalid time format");
};

// 🟢 GET all exam data
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.from("ExamData").select("*");

    if (error) throw error;

    const examsWithTotalCount = data.map((examData) => ({
      ...examData,
      totalExams: examData.exams?.length || 0,
    }));

    res.status(200).json(examsWithTotalCount);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🟠 POST add new exam data
router.post("/", async (req, res) => {
  try {
    const { class: className, subject, date, time, venue } = req.body;

    if (!className || !subject || !date || !time || !venue) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const formattedTime = formatTimeWithMeridian(time);

    // Fetch existing exam data for the class
    const { data: existing, error: fetchError } = await supabase
      .from("ExamData")
      .select("*")
      .eq("class", className)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") throw fetchError;

    const newExam = { subject, date, time: formattedTime, venue };

    if (!existing) {
      // If no record exists, create a new one
      const { data, error } = await supabase
        .from("ExamData")
        .insert([{ class: className, exams: [newExam], createdAt: new Date().toISOString() }])
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        message: "Exam added successfully.",
        examData: { ...data, totalExams: data.exams.length },
      });
    }

    // Append new exam to existing record
    const updatedExams = [...(existing.exams || []), newExam];

    const { data, error } = await supabase
      .from("ExamData")
      .update({ exams: updatedExams, updatedAt: new Date().toISOString() })
      .eq("class", className)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: "Exam added successfully.",
      examData: { ...data, totalExams: updatedExams.length },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🧭 GET all upcoming exams (across classes)
router.get("/upcoming-exams", async (req, res) => {
  try {
    const upcomingExams = getUpcomingExams();

    const withCounts = upcomingExams.map((examData) => ({
      ...examData,
      totalExams: examData.exams?.length || 0,
    }));

    res.status(200).json(withCounts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching upcoming exams", error: error.message });
  }
});

// 🎯 GET upcoming exams for a specific class
router.get("/upcoming-exams/:class", async (req, res) => {
  try {
    const { class: className } = req.params;

    const { data: examData, error } = await supabase
      .from("ExamData")
      .select("*")
      .eq("class", className)
      .single();

    if (error && error.code === "PGRST116") {
      return res.status(404).json({ message: `No exams found for class ${className}.` });
    }
    if (error) throw error;

    const currentDate = new Date();
    const upcomingExams = (examData.exams || []).filter(
      (exam) => new Date(exam.date) > currentDate
    );

    res.status(200).json({
      class: className,
      upcomingExams,
      totalUpcomingExams: upcomingExams.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching upcoming exams", error: error.message });
  }
});

// ❌ DELETE exam by class & subject
router.delete("/:class/:subject", async (req, res) => {
  try {
    const { class: className, subject } = req.params;

    const { data: examData, error } = await supabase
      .from("ExamData")
      .select("*")
      .eq("class", className)
      .single();

    if (error && error.code === "PGRST116") {
      return res.status(404).json({ message: "Class not found." });
    }
    if (error) throw error;

    const updatedExams = (examData.exams || []).filter((exam) => exam.subject !== subject);

    if (updatedExams.length === examData.exams.length) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const { data, error: updateError } = await supabase
      .from("ExamData")
      .update({ exams: updatedExams, updatedAt: new Date().toISOString() })
      .eq("class", className)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({
      message: "Exam removed successfully.",
      examData: { ...data, totalExams: updatedExams.length },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
