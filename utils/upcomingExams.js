import examData from "../defaultData/defaultExamTimetable.js";

export const getUpcomingExams = () => {
  const currentDate = new Date(); // Get the current date and time

  const upcomingExams = examData.map((classData) => {
    const { class: className, exams } = classData;

    // Filter exams that are yet to be written
    const examsYetToBeWritten = exams.filter((exam) => {
      const examDateTime = new Date(`${exam.date} ${exam.time}`);
      return examDateTime > currentDate; // Check if the exam is in the future
    });

    return {
      class: className,
      totalUpcomingExams: examsYetToBeWritten.length, // Total number of upcoming exams
      exams: examsYetToBeWritten, // List of upcoming exams
    };
  });

  return upcomingExams;
};