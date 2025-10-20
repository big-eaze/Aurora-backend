import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// 🟢 GET all class population data
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("ClassPopulations")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// 🟠 UPDATE class population for a specific class
router.put("/:class", requireRole("admin"), async (req, res) => {
  try {
    const { class: className } = req.params;
    const { numberOfStudents } = req.body;

    if (!numberOfStudents || isNaN(numberOfStudents)) {
      return res.status(400).json({ message: "Invalid or missing numberOfStudents." });
    }

    // Check if class exists
    const { data: existing, error: findError } = await supabase
      .from("ClassPopulations")
      .select("*")
      .eq("class", className)
      .single();

    if (findError && findError.code !== "PGRST116") throw findError;

    if (!existing) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Update record
    const { data, error } = await supabase
      .from("ClassPopulations")
      .update({
        numberOfStudents,
        updatedAt: new Date().toISOString(),
      })
      .eq("class", className)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      message: "Class population updated successfully",
      classPopulation: data,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating class population", error: error.message });
  }
});

export default router;
