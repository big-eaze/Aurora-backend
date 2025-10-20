import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import staffRoutes from './routes/staffRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import resultRoutes from './routes/resultRoutes.js';
import examRoutes from './routes/examRoutes.js';
import classPopulationRoutes from './routes/classPopulationRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import staffAttendanceRoutes from './routes/staffAttendanceRoutes.js';
import studentAttendanceRoutes from './routes/studentAttendanceRoutes.js';
import authRoutes from './routes/authRoutes.js';

dotenv.config();
const app = express();

// ====== CORS CONFIG ======
const allowedOrigins = [
  "https://aurora-end.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());
app.use(express.json());

// ====== ROUTES ======
app.get("/", (req, res) => res.send("Aurora Backend is running 🚀"));
app.use('/staff', staffRoutes);
app.use('/students', studentRoutes);
app.use('/results', resultRoutes);
app.use('/class-population', classPopulationRoutes);
app.use('/exam-timetable', examRoutes);
app.use('/announcements', announcementRoutes);
app.use('/courses', courseRoutes);
app.use('/assignments', assignmentRoutes);
app.use('/staff-attendance', staffAttendanceRoutes);
app.use('/student-attendance', studentAttendanceRoutes);
app.use('/auth', authRoutes);

// ====== STATIC BUILD (PRODUCTION) ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ====== ERROR HANDLER ======
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({ message: 'Something went wrong', error: err.message });
});

// ====== SERVER START ======
const PORT = process.env.PORT || 8080;
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));
}

export default app;
