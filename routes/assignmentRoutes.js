import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

// ✅ GET all assignments
router.get("/", async (req, res) => {
  try {
    const { data: assignments, error } = await supabase.from("Assignments").select("*");

    if (error) throw error;

    const enrichedAssignments = assignments.map((assignment) => ({
      ...assignment,
      totalTasks: Array.isArray(assignment.tasks) ? assignment.tasks.length : 0,
    }));

    res.status(200).json(enrichedAssignments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching assignments", error: error.message });
  }
});

// ✅ GET assignments for a specific class
router.get("/:class", requireRole("student", "staff"), async (req, res) => {
  try {
    const { class: className } = req.params;

    const { data: assignments, error } = await supabase
      .from("Assignments")
      .select("*")
      .eq("class", className)
      .limit(1);

    if (error) throw error;

    const assignment = assignments[0];

    if (!assignment) {
      return res.status(200).json({
        message: `No assignments added yet for class ${className}.`,
        totalTasks: 0,
        tasks: [],
      });
    }

    res.status(200).json({
      ...assignment,
      totalTasks: Array.isArray(assignment.tasks) ? assignment.tasks.length : 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching assignments for the class", error: error.message });
  }
});

// ✅ POST new assignments for a class
router.post("/:class", requireRole("staff"), async (req, res) => {
  try {
    const { class: className } = req.params;
    const tasksInput = req.body.tasks || [req.body];
    const isValid = tasksInput.every(
      (task) => task.title && task.dueDate && task.description
    );

    if (!isValid) {
      return res.status(400).json({
        message: "Each task must include title, dueDate, and description.",
      });
    }

    const { data: existingAssignments, error: fetchError } = await supabase
      .from("Assignments")
      .select("*")
      .eq("class", className)
      .limit(1);

    if (fetchError) throw fetchError;

    const existingAssignment = existingAssignments[0];

    if (existingAssignment) {
      // ✅ Ensure tasks is parsed correctly
      const existingTasks = Array.isArray(existingAssignment.tasks)
        ? existingAssignment.tasks
        : JSON.parse(existingAssignment.tasks || "[]");

      const updatedTasks = [...existingTasks, ...tasksInput];

      const { error: updateError } = await supabase
        .from("Assignments")
        .update({ tasks: updatedTasks })
        .eq("id", existingAssignment.id);

      if (updateError) throw updateError;

      return res.status(200).json({
        message: "Task(s) added",
        assignment: { ...existingAssignment, tasks: updatedTasks },
      });
    }

    const { data: newAssignment, error: insertError } = await supabase
      .from("Assignments")
      .insert([{ class: className, tasks: tasksInput }])
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({ message: "Assignment created", assignment: newAssignment });
  } catch (err) {
    console.error("❌ Error adding assignment:", err);
    res.status(500).json({ message: "Error adding assignment", error: err.message });
  }
});


export default router;
