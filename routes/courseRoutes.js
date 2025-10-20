import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// 🟢 GET all courses
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Courses")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🟠 GET course data for a specific class
router.get("/:class", async (req, res) => {
  try {
    const { class: className } = req.params;

    const { data, error } = await supabase
      .from("Courses")
      .select("*")
      .eq("class", className)
      .single();

    if (error && error.code === "PGRST116") {
      return res.status(404).json({ error: `No course data found for class ${className}.` });
    }
    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔵 PUT update number of courses for a specific class
router.put("/:class", async (req, res) => {
  try {
    const { class: className } = req.params;
    const { numberOfCourses } = req.body;

    if (!numberOfCourses) {
      return res.status(400).json({ error: "numberOfCourses is required." });
    }

    // Check if class exists
    const { data: existing, error: findError } = await supabase
      .from("Courses")
      .select("*")
      .eq("class", className)
      .single();

    if (findError && findError.code !== "PGRST116") throw findError;

    if (!existing) {
      return res.status(404).json({ error: `Class ${className} not found.` });
    }

    // Update the record
    const { data, error } = await supabase
      .from("Courses")
      .update({
        numberOfCourses,
        updatedAt: new Date().toISOString(),
      })
      .eq("class", className)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      message: `Number of courses updated for ${className}.`,
      course: data,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
