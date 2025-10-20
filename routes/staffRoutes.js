import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();
router.use(authMiddleware);

// ✅ GET all staff
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { data: staffMembers, error } = await supabase
      .from("Staffs")
      .select("*");

    if (error) throw error;

    res.status(200).json({
      totalStaff: staffMembers.length,
      staffMembers,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching staff members", error: error.message });
  }
});

// ✅ GET single staff by staffId
router.get("/:staffId", requireRole("admin"), async (req, res) => {
  try {
    const { staffId } = req.params;

    const { data: staffMember, error } = await supabase
      .from("Staffs")
      .select("*")
      .eq("staffId", staffId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ message: "Staff member not found." });
      }
      throw error;
    }

    res.status(200).json(staffMember);
  } catch (error) {
    res.status(500).json({ message: "Error fetching staff member", error: error.message });
  }
});

// ✅ POST add new staff
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { staffId, name, subject, class: staffClass, email, phone, gender } = req.body;

    if (!staffId || !name || !subject || !staffClass || !gender || !phone) {
      return res.status(400).json({ message: "Please fill in all required fields." });
    }

    // Check for duplicate staffId
    const { data: existingStaff } = await supabase
      .from("Staffs")
      .select("staffId")
      .eq("staffId", staffId)
      .maybeSingle();

    if (existingStaff) {
      return res.status(409).json({ message: "Staff ID already exists." });
    }

    // Insert new staff
    const { data, error } = await supabase
      .from("Staffs")
      .insert([{ staffId, name, subject, class: staffClass, email, phone, gender }])
      .select()
      .single();

    if (error) throw error;

    const { count } = await supabase
      .from("Staffs")
      .select("*", { count: "exact", head: true });

    res.status(201).json({
      message: "Staff member added successfully.",
      staff: data,
      totalStaff: count,
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding staff member", error: error.message });
  }
});

// ✅ DELETE staff (also remove from staffAttendance)
router.delete("/:staffId", requireRole("admin"), async (req, res) => {
  try {
    const { staffId } = req.params;

    // Find staff
    const { data: staffMember, error: findError } = await supabase
      .from("Staffs")
      .select("*")
      .eq("staffId", staffId)
      .single();

    if (findError) {
      if (findError.code === "PGRST116") {
        return res.status(404).json({ message: "Staff member not found." });
      }
      throw findError;
    }

    // Fetch attendance records
    const { data: attendanceRecords, error: attError } = await supabase
      .from("StaffAttendances")
      .select("*");

    if (attError) throw attError;

    // Remove staffId from each record’s staffStatus array
    for (const record of attendanceRecords) {
      if (Array.isArray(record.staffStatus)) {
        const updatedStatus = record.staffStatus.filter(entry => entry.staffId !== staffId);

        if (updatedStatus.length !== record.staffStatus.length) {
          await supabase
            .from("StaffAttendances")
            .update({ staffStatus: updatedStatus })
            .eq("id", record.id);
        }
      }
    }

    // Delete staff
    const { error: deleteError } = await supabase
      .from("Staffs")
      .delete()
      .eq("staffId", staffId);

    if (deleteError) throw deleteError;

    // Get updated staff count
    const { count } = await supabase
      .from("Staffs")
      .select("*", { count: "exact", head: true });

    res.status(200).json({
      message: "Staff member deleted successfully.",
      totalStaff: count,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting staff member", error: error.message });
  }
});

export default router;
