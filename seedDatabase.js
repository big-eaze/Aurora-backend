import { supabase } from "./config/supabaseClient.js";

// Import all default data
import announcementData from "./defaultData/defaultAnnouncement.js";
import classPopulationData from "./defaultData/defaultClassPopulation.js";
import courseData from "./defaultData/defaultCourses.js";
import studentData from "./defaultData/defaultStudent.js";
import staffData from "./defaultData/defaultStaff.js";
import examData from "./defaultData/defaultExamTimetable.js";
import resultData from "./defaultData/defaultResults.js";
import studentAttendanceData from "./defaultData/defaultStudentAttendance.js";
import staffAttendanceData from "./defaultData/defaultStaffAttendance.js";
import assignmentData from "./defaultData/defaultAssignment.js";

const tables = [
  "Results",
  "ExamData",
  "Courses",
  "ClassPopulations",
  "Announcements",
  "Assignments",
  "StaffAttendances",
  "StudentAttendances",
  "Staffs",
  "Students"
];

// Map each table to its primary key
const primaryKeys = {
  Students: "admissionNumber",
  Staffs: "id",
  Courses: "id",
  Results: "id",
  Assignments: "id",
  Announcements: "id",
  ClassPopulations: "id",
  StaffAttendances: "id",
  StudentAttendances: "id",
  ExamData: "id"
};

const seedDatabase = async () => {
  try {
    console.log("🌱 Starting Supabase seeding...");

    // 🧹 Step 1: Clear all existing data in proper order
    for (const table of tables) {
      const pk = primaryKeys[table];
      const { error } = await supabase
        .from(table)
        .delete()
        .neq(pk, pk === "admissionNumber" ? "" : 0);
      if (error) throw new Error(`Error clearing table ${table}: ${error.message}`);
      console.log(`🧹 Cleared ${table}`);
    }

    // 🧑‍🎓 Students
    const { error: studentError } = await supabase.from("Students").insert(studentData);
    if (studentError) throw new Error(`Students: ${studentError.message}`);
    console.log("✅ Students seeded!");

    // 👨‍🏫 Staff
    const { error: staffError } = await supabase.from("Staffs").insert(staffData);
    if (staffError) throw new Error(`Staffs: ${staffError.message}`);
    console.log("✅ Staffs seeded!");

    // 🕓 Student Attendance
    for (const attendance of studentAttendanceData) {
      const { date, studentStatus } = attendance;
      const records = studentStatus.map(({ admissionNumber, status }) => ({
        date,
        status,
        admissionNumber
      }));
      const { error } = await supabase.from("StudentAttendances").insert(records);
      if (error) throw new Error(`StudentAttendance: ${error.message}`);
    }
    console.log("✅ Student attendance seeded!");

    // 👨‍🏫 Staff Attendance
    const { error: staffAttendanceError } = await supabase.from("StaffAttendances").insert(staffAttendanceData);
    if (staffAttendanceError) throw new Error(`StaffAttendance: ${staffAttendanceError.message}`);
    console.log("✅ Staff attendance seeded!");

    // 📚 Assignments
    const { error: assignmentError } = await supabase.from("Assignments").insert(assignmentData);
    if (assignmentError) throw new Error(`Assignments: ${assignmentError.message}`);
    console.log("✅ Assignments seeded!");

    // 📢 Announcements
    const { error: announcementError } = await supabase.from("Announcements").insert(
      announcementData.map(a => ({
        audience: a.receiver,
        announcements: JSON.stringify([{
          title: a.title,
          date: a.date,
          time: a.time,
          message: a.content
        }]),
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    );
    if (announcementError) throw new Error(`Announcements: ${announcementError.message}`);
    console.log("✅ Announcements seeded!");

    // 👥 Class Populations
    const { error: classPopulationError } = await supabase.from("ClassPopulations").insert(classPopulationData);
    if (classPopulationError) throw new Error(`ClassPopulations: ${classPopulationError.message}`);
    console.log("✅ Class populations seeded!");

    // 📘 Courses
    const { error: courseError } = await supabase.from("Courses").insert(courseData);
    if (courseError) throw new Error(`Courses: ${courseError.message}`);
    console.log("✅ Courses seeded!");

    // 🧾 Exam Data
    const { error: examError } = await supabase.from("ExamData").insert(examData);
    if (examError) throw new Error(`ExamData: ${examError.message}`);
    console.log("✅ Exam data seeded!");

    // 📊 Results
    const { error: resultError } = await supabase.from("Results").insert(resultData);
    if (resultError) throw new Error(`Results: ${resultError.message}`);
    console.log("✅ Results seeded!");

    console.log("🎉 All data seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
};

seedDatabase();
