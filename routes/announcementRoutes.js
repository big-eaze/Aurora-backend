import express from "express";
import { supabase } from "../config/supabaseClient.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// Utility: Convert 24-hour time to 12-hour format
const convertTo12HourFormat = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const adjustedHours = hours % 12 || 12;
  return `${adjustedHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};


// 🟢 GET all announcements (flattened)
router.get("/", requireRole("student", "staff", "admin"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Announcements")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) throw error;

    // Flatten announcements
    const flattened = data.flatMap((item) => {
      try {
        const annArray = JSON.parse(item.announcements);
        return annArray.map((ann, index) => ({
          id: `${item.id}-${index}`, // unique key
          title: ann.title,
          message: ann.message,
          date: ann.date,
          time: ann.time,
          receiver: item.audience, // your DB column
          createdAt: item.createdAt,
        }));
      } catch {
        return [];
      }
    });

    res.status(200).json(flattened);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================
// 🟢 POST new announcement
// ============================
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { title, date, time, content, receiver } = req.body;

    if (!title || !date || !time || !content || !receiver) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const formattedTime = convertTo12HourFormat(time);

    let newAnnouncements = [];

    if (receiver === "both") {
      newAnnouncements = [
        {
          title,
          date,
          time: formattedTime,
          content,
          receiver: "staff",
        },
        {
          title,
          date,
          time: formattedTime,
          content,
          receiver: "students",
        },
      ];
    } else {
      newAnnouncements = [
        {
          title,
          date,
          time: formattedTime,
          content,
          receiver,
        },
      ];
    }

    const { data, error } = await supabase
      .from("Announcements")
      .insert([
        {
          audience: receiver === "both" ? "both" : receiver,
          announcements: newAnnouncements,
        },
      ])
      .select();

    if (error) throw error;

    res.status(201).json({ message: "Announcement(s) created successfully", data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
