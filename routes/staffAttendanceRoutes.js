import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// ✅ Utility: Calculate weekly attendance rate for a staff member
const calculateWeeklyAttendanceRate = (attendanceRecords, staffId) => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  let totalDays = 0;
  let presentDays = 0;

  attendanceRecords.forEach((record) => {
    const recordDate = new Date(record.date);
    const dayOfWeek = recordDate.getDay();

    // Safely parse staffStatus if it's a string
    let staffStatus = record.staffStatus;
    if (typeof staffStatus === "string") {
      try {
        staffStatus = JSON.parse(staffStatus);
      } catch (e) {
        console.warn("⚠️ Could not parse staffStatus in record:", record.id);
        staffStatus = [];
      }
    }

    // Only weekdays
    if (recordDate >= oneWeekAgo && dayOfWeek >= 1 && dayOfWeek <= 5) {
      const staffEntry = Array.isArray(staffStatus)
        ? staffStatus.find((s) => s.id === staffId)
        : null;

      if (staffEntry) {
        totalDays++;
        if (staffEntry.status === "present") presentDays++;
      }
    }
  });

  return totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
};



// ===========================================================
// ✅ GET /api/staffAttendance
// Fetch all staff attendance summary
// ===========================================================
router.get("/:staffId", requireRole("admin", "staff"), async (req, res) => {
  const { staffId } = req.params;
  const { expand } = req.query;

  console.log("📩 Incoming request to /staff-attendance for:", staffId);

  try {
    // ✅ Fetch attendance for that staff from correct table
    const { data: attendanceData, error } = await supabase
      .from("StaffAttendances")
      .select("*");


    if (error) throw error;

    if (!attendanceData || attendanceData.length === 0) {
      return res
        .status(404)
        .json({ message: "No attendance data found for this staff ID." });
    }

    // filter and calculate
    const filteredAttendance = attendanceData.map((record) => {
      let staffStatus = record.staffStatus;

      if (typeof staffStatus === "string") {
        try {
          staffStatus = JSON.parse(staffStatus);
        } catch (e) {
          console.warn("⚠️ Could not parse staffStatus for record:", record.id);
          staffStatus = [];
        }
      }

      const filtered = staffStatus.filter((s) => s.id === staffId);
      return { date: record.date, staffStatus: filtered };
    });

    const totalDays = filteredAttendance.length;
    const daysPresent = filteredAttendance.filter(
      (r) => r.staffStatus[0]?.status === "present"
    ).length;
    const daysAbsent = totalDays - daysPresent;
    const weeklyAttendanceRate = calculateWeeklyAttendanceRate(attendanceData, staffId);
    const overallAttendanceRate =
      totalDays > 0 ? (daysPresent / totalDays) * 100 : 0;

    // ✅ If expand=staff, include staff details
    if (expand === "staff") {
      const { data: staffDetails, error: staffError } = await supabase
        .from("Staffs")
        .select("*")
        .eq("staffId", staffId)
        .single();

      if (staffError) throw staffError;

      return res.status(200).json({
        staffDetails,
        totalDays,
        daysPresent,
        daysAbsent,
        weeklyAttendanceRate: `${weeklyAttendanceRate.toFixed(0)}%`,
        overallAttendanceRate: `${overallAttendanceRate.toFixed(0)}%`,
        attendance: filteredAttendance,
      });
    }

    res.status(200).json({
      totalDays,
      daysPresent,
      daysAbsent,
      weeklyAttendanceRate: `${weeklyAttendanceRate.toFixed(2)}%`,
      overallAttendanceRate: `${overallAttendanceRate.toFixed(2)}%`,
      attendance: filteredAttendance,
    });
  } catch (error) {
    console.error("❌ Error fetching attendance data:", error.message);
    res.status(500).json({
      message: "Error fetching attendance data",
      error: error.message,
    });
  }
});

// ===========================================================
// GET all staff attendance
// Optional: ?expand=staff to include staff details
// ===========================================================
router.get("/", requireRole("admin"), async (req, res) => {
  const { expand } = req.query;

  try {
    // Fetch all attendance records
    const { data: attendanceData, error } = await supabase
      .from("StaffAttendances")
      .select("*");

    if (error) throw error;
    if (!attendanceData || attendanceData.length === 0) {
      return res.status(404).json({ message: "No attendance data found." });
    }

    let result = attendanceData;

    // If expand=staff, attach staff details to each attendance record
    if (expand === "staff") {
      // Fetch all staff
      const { data: allStaff, error: staffError } = await supabase
        .from("Staffs")
        .select("*");

      if (staffError) throw staffError;

      // Map each attendance record to include staff details
      result = attendanceData.map((record) => {
        let staffStatus = record.staffStatus;
        if (typeof staffStatus === "string") {
          try { staffStatus = JSON.parse(staffStatus); } catch { staffStatus = []; }
        }

        const detailedStatus = staffStatus.map((entry) => {
          const staff = allStaff.find((s) => s.staffId === entry.id);
          return { ...entry, staffDetails: staff || null };
        });

        return { ...record, staffStatus: detailedStatus };
      });
    }

    res.status(200).json({ attendance: result });
  } catch (error) {
    console.error("❌ Error fetching all attendance:", error.message);
    res.status(500).json({ message: "Error fetching attendance data", error: error.message });
  }
});



// ===========================================================
// ✅ POST /api/staffAttendance/:staffId
// Add or update attendance record
// ===========================================================
router.post("/:staffId", async (req, res) => {
  try {
    const { staffId } = req.params;
    const { date, status } = req.body;

    console.log("📅 Incoming Attendance Request:", { staffId, date, status });

    if (!date || !status) {
      return res.status(400).json({ message: "Date and status are required." });
    }

    const { data: existingRecord, error: findError } = await supabase
      .from("StaffAttendances")
      .select("*")
      .eq("date", date)
      .single(); // ✅ fixed

    if (findError && findError.code !== "PGRST116") throw findError; // ignore 'no rows' case

    if (!existingRecord) {
      const { error: insertError } = await supabase
        .from("StaffAttendances")
        .insert([{ date, staffStatus: JSON.stringify([{ id: staffId, status }]) }]);

      if (insertError) throw insertError;

      console.log("✅ New attendance record created");
      return res.status(201).json({ message: "New attendance record created successfully." });
    }

    const updatedStatuses = existingRecord.staffStatus || [];
    const index = updatedStatuses.findIndex((entry) => entry.id === staffId);

    if (index !== -1) {
      updatedStatuses[index].status = status;
    } else {
      updatedStatuses.push({ id: staffId, status });
    }

    const { error: updateError } = await supabase
      .from("StaffAttendances")
      .update({ staffStatus: JSON.stringify(updatedStatuses) })
      .eq("id", existingRecord.id);

    if (updateError) throw updateError;

    console.log("✅ Attendance updated successfully");
    res.status(200).json({ message: "Attendance status updated successfully." });
  } catch (error) {
    console.error("❌ Backend error:", error.message, error);
    res.status(500).json({ message: "Error updating attendance status", error: error.message });
  }
});



export default router;
