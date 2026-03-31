import { Router } from "express";
import { db } from "@workspace/db";
import { trainingApplicationsTable, mcqQuestionsTable, employeesTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { type AuthenticatedRequest, authMiddleware, requireRoles } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";
import path from "path";
import fs from "fs";
import multer from "multer";
import PDFDocument from "pdfkit";

async function generateEmployeeCode(): Promise<string> {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(employeesTable);
  const count = Number(result.count) + 1;
  return `EMP${String(count).padStart(4, "0")}`;
}

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "applications");
const PDF_DIR = path.join(process.cwd(), "uploads", "pdfs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and PDF files are allowed"));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const uploadFields = upload.fields([
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

async function generateCRN(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trainingApplicationsTable)
    .where(sql`extract(year from ${trainingApplicationsTable.createdAt}) = ${year}`);
  const seq = (Number(result.count) + 1).toString().padStart(4, "0");
  return `CRN-${year}-${seq}`;
}

const PAKISTAN_HOLIDAYS_2026 = [
  "2026-02-05", "2026-03-23", "2026-03-20", "2026-03-21",
  "2026-05-01", "2026-05-27", "2026-05-28", "2026-05-29",
  "2026-06-27", "2026-06-28",
  "2026-07-05", "2026-08-03", "2026-08-04",
  "2026-08-14", "2026-08-27",
  "2026-09-27", "2026-11-09", "2026-12-25",
];

function addWorkingDays(startDate: Date, days: number): Date {
  const holidays = new Set(PAKISTAN_HOLIDAYS_2026);
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    const dateStr = result.toISOString().split("T")[0];
    if (dayOfWeek !== 0 && !holidays.has(dateStr)) {
      added++;
    }
  }
  result.setHours(11, 0, 0, 0);
  return result;
}

function generatePDF(application: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = `result-${application.crn}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(20).font("Helvetica-Bold").text("Alam & Aulakh", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("(Chartered Accountants)", { align: "center" });
    doc.fontSize(9).text("Lahore | Islamabad", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(14).font("Helvetica-Bold").text("CA Training Application & Test Result", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica").text(`CRN: ${application.crn}`, { align: "center" });
    doc.moveDown(1);

    const tableY = doc.y;
    const leftCol = 50;
    const rightCol = 300;
    const lineHeight = 18;

    function drawRow(label: string, value: string, y: number) {
      doc.fontSize(9).font("Helvetica-Bold").text(label, leftCol, y, { width: 240 });
      doc.font("Helvetica").text(value || "N/A", rightCol, y, { width: 245 });
    }

    doc.fontSize(12).font("Helvetica-Bold").text("1. Candidate Information", leftCol, tableY);
    let y = tableY + 22;
    drawRow("Full Name:", application.fullName, y); y += lineHeight;
    drawRow("Father's Name:", application.fatherName, y); y += lineHeight;
    drawRow("CNIC:", application.cnic, y); y += lineHeight;
    drawRow("Date of Birth:", new Date(application.dateOfBirth).toLocaleDateString("en-PK"), y); y += lineHeight;
    drawRow("Gender:", application.gender, y); y += lineHeight;
    drawRow("Email:", application.email, y); y += lineHeight;
    drawRow("Mobile:", application.mobile, y); y += lineHeight;
    drawRow("Preferred Location:", application.preferredLocation, y); y += lineHeight;
    drawRow("Preferred Department:", application.preferredDept, y); y += lineHeight;
    y += 10;

    doc.fontSize(12).font("Helvetica-Bold").text("2. Academic Details", leftCol, y);
    y += 22;
    drawRow("Matric:", `${application.matricBoard} — ${application.matricYear} — ${application.matricMarks}`, y); y += lineHeight;
    drawRow("Intermediate:", `${application.interBoard} — ${application.interYear} — ${application.interMarks}`, y); y += lineHeight;
    if (application.graduationDegree) {
      drawRow("Graduation:", `${application.graduationDegree} — ${application.graduationUni || ""} — ${application.graduationYear || ""} — ${application.graduationMarks || ""}`, y);
      y += lineHeight;
    }
    drawRow("ICAP Level:", application.icapLevel, y); y += lineHeight;
    if (application.icapRegNo) { drawRow("ICAP Reg No:", application.icapRegNo, y); y += lineHeight; }
    y += 10;

    doc.fontSize(12).font("Helvetica-Bold").text("3. Skills", leftCol, y);
    y += 22;
    drawRow("Accounting:", application.accountingLevel, y); y += lineHeight;
    drawRow("Excel:", application.excelLevel, y); y += lineHeight;
    drawRow("Communication:", application.communication, y); y += lineHeight;
    if (application.softwareSkills) { drawRow("Software:", application.softwareSkills, y); y += lineHeight; }
    y += 10;

    if (y > 650) { doc.addPage(); y = 50; }

    doc.fontSize(12).font("Helvetica-Bold").text("4. Test Result", leftCol, y);
    y += 22;
    drawRow("Score:", `${application.testScore} / ${application.testTotal}`, y); y += lineHeight;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("green").text("Status: PASSED", rightCol, y);
    doc.fillColor("black");
    y += lineHeight + 10;

    doc.fontSize(12).font("Helvetica-Bold").text("5. Interview Schedule", leftCol, y);
    y += 22;
    const intDate = new Date(application.interviewDate);
    drawRow("Date:", intDate.toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), y); y += lineHeight;
    drawRow("Time:", "11:00 AM — 12:00 PM", y); y += lineHeight;
    drawRow("Location:", application.preferredLocation === "Lahore"
      ? "Suite 5,6 Ross Residencia, Canal Road, Lahore"
      : "16th Floor, State Life Building, F-6, Islamabad", y);
    y += lineHeight * 2;

    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 10;
    doc.fontSize(8).font("Helvetica-Oblique").text(
      "This is a system-generated document and does not require signature.",
      leftCol, y, { align: "center" }
    );

    doc.end();
    stream.on("finish", () => resolve(`/uploads/pdfs/${filename}`));
    stream.on("error", reject);
  });
}

router.post("/public/submit", uploadFields, async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.cnicFront?.[0] || !files?.cnicBack?.[0] || !files?.photo?.[0]) {
      return res.status(400).json({ error: "CNIC front, CNIC back, and photo are required" });
    }

    const body = req.body;

    const cnicRegex = /^\d{5}-\d{7}-\d$/;
    if (!cnicRegex.test(body.cnic)) {
      return res.status(400).json({ error: "Invalid CNIC format. Use xxxxx-xxxxxxx-x" });
    }

    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const requiredFields = [
      "fullName", "fatherName", "cnic", "dateOfBirth", "gender", "maritalStatus",
      "mobile", "email", "currentAddress", "permanentAddress",
      "matricBoard", "matricYear", "matricMarks",
      "interBoard", "interYear", "interMarks",
      "icapLevel", "preferredLocation", "preferredDept",
      "availableStart", "accountingLevel", "excelLevel", "communication",
    ];

    for (const field of requiredFields) {
      if (!body[field]) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }

    if (body.declaration !== "true" && body.declaration !== true) {
      return res.status(400).json({ error: "Declaration must be accepted" });
    }

    const existing = await db.select({ id: trainingApplicationsTable.id })
      .from(trainingApplicationsTable)
      .where(eq(trainingApplicationsTable.cnic, body.cnic));

    if (existing.length > 0) {
      return res.status(409).json({ error: "You have already applied. Re-application is not allowed." });
    }

    const crn = await generateCRN();

    const [application] = await db.insert(trainingApplicationsTable).values({
      crn,
      fullName: body.fullName,
      fatherName: body.fatherName,
      cnic: body.cnic,
      dateOfBirth: new Date(body.dateOfBirth),
      gender: body.gender,
      maritalStatus: body.maritalStatus,
      mobile: body.mobile,
      alternateMobile: body.alternateMobile || null,
      email: body.email,
      currentAddress: body.currentAddress,
      permanentAddress: body.permanentAddress,
      cnicFrontUrl: `/uploads/applications/${files.cnicFront[0].filename}`,
      cnicBackUrl: `/uploads/applications/${files.cnicBack[0].filename}`,
      photoUrl: `/uploads/applications/${files.photo[0].filename}`,
      matricBoard: body.matricBoard,
      matricYear: parseInt(body.matricYear),
      matricMarks: body.matricMarks,
      interBoard: body.interBoard,
      interYear: parseInt(body.interYear),
      interMarks: body.interMarks,
      graduationDegree: body.graduationDegree || null,
      graduationUni: body.graduationUni || null,
      graduationYear: body.graduationYear ? parseInt(body.graduationYear) : null,
      graduationMarks: body.graduationMarks || null,
      icapRegNo: body.icapRegNo || null,
      icapLevel: body.icapLevel,
      preferredLocation: body.preferredLocation,
      preferredDept: body.preferredDept,
      availableStart: new Date(body.availableStart),
      isFullTime: body.isFullTime === "true" || body.isFullTime === true,
      currentEngagement: body.currentEngagement || null,
      accountingLevel: body.accountingLevel,
      excelLevel: body.excelLevel,
      softwareSkills: body.softwareSkills || null,
      communication: body.communication,
      experienceDetails: body.experienceDetails || null,
      declaration: true,
    }).returning();

    res.status(201).json({ message: "Application submitted successfully", id: application.id, crn: application.crn });
  } catch (error: any) {
    console.error("Application submission error:", error);
    res.status(500).json({ error: error.message || "Failed to submit application" });
  }
});

router.get("/public/check-icap/:regNo", async (req, res) => {
  try {
    const regNo = req.params.regNo as string;
    const [existing] = await db
      .select({ id: trainingApplicationsTable.id })
      .from(trainingApplicationsTable)
      .where(eq(trainingApplicationsTable.icapRegNo, regNo));
    res.json({ exists: !!existing });
  } catch (error) {
    console.error("Error checking ICAP reg:", error);
    res.json({ exists: false });
  }
});

router.get("/public/lookup/:crn", async (req, res) => {
  try {
    const [application] = await db
      .select({
        id: trainingApplicationsTable.id,
        crn: trainingApplicationsTable.crn,
        fullName: trainingApplicationsTable.fullName,
        testStatus: trainingApplicationsTable.testStatus,
        testScore: trainingApplicationsTable.testScore,
        testTotal: trainingApplicationsTable.testTotal,
        interviewDate: trainingApplicationsTable.interviewDate,
        pdfUrl: trainingApplicationsTable.pdfUrl,
        preferredLocation: trainingApplicationsTable.preferredLocation,
      })
      .from(trainingApplicationsTable)
      .where(eq(trainingApplicationsTable.crn, req.params.crn));

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json(application);
  } catch (error) {
    console.error("Error looking up application:", error);
    res.status(500).json({ error: "Failed to look up application" });
  }
});

router.get("/public/test/:crn", async (req, res) => {
  try {
    const [application] = await db
      .select({
        id: trainingApplicationsTable.id,
        crn: trainingApplicationsTable.crn,
        fullName: trainingApplicationsTable.fullName,
        testStatus: trainingApplicationsTable.testStatus,
      })
      .from(trainingApplicationsTable)
      .where(eq(trainingApplicationsTable.crn, req.params.crn));

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (application.testStatus) {
      return res.status(403).json({ error: "Test already attempted. Only one attempt is allowed." });
    }

    const allQuestions = await db.select().from(mcqQuestionsTable);

    const categories: Record<string, typeof allQuestions> = {};
    for (const q of allQuestions) {
      if (!categories[q.category]) categories[q.category] = [];
      categories[q.category].push(q);
    }

    const selected: typeof allQuestions = [];
    const picks: Record<string, number> = {
      Accounting: 4, Audit: 2, Tax: 2, Excel: 1, General: 1,
    };

    for (const [cat, count] of Object.entries(picks)) {
      const pool = categories[cat] || [];
      const shuffled = pool.sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, count));
    }

    const finalQuestions = selected.sort(() => Math.random() - 0.5);

    const questions = finalQuestions.map((q: any) => ({
      id: q.id,
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      category: q.category,
    }));

    res.json({ candidateName: application.fullName, crn: application.crn, questions });
  } catch (error) {
    console.error("Error fetching test:", error);
    res.status(500).json({ error: "Failed to fetch test questions" });
  }
});

router.post("/public/test/:crn/submit", async (req, res) => {
  try {
    const { answers } = req.body;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Answers are required" });
    }

    const [application] = await db
      .select()
      .from(trainingApplicationsTable)
      .where(eq(trainingApplicationsTable.crn, req.params.crn));

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (application.testStatus) {
      return res.status(403).json({ error: "Test already attempted. Only one attempt is allowed." });
    }

    const questionIds = Object.keys(answers).map(Number);
    if (questionIds.length < 10) {
      return res.status(400).json({ error: "All 10 questions must be answered" });
    }

    const questions = await db.select().from(mcqQuestionsTable);
    const questionMap = new Map(questions.map((q: any) => [q.id, q]));

    let score = 0;
    for (const [qId, answer] of Object.entries(answers)) {
      const question = questionMap.get(Number(qId)) as any;
      if (question && question.correct === answer) {
        score++;
      }
    }

    const passed = score >= 8;
    const testStatus = passed ? "Passed" : "Failed";
    const interviewDate = passed ? addWorkingDays(new Date(), 7) : null;

    const updateData: any = {
      testScore: score,
      testTotal: 10,
      testStatus,
      testDate: new Date(),
      testAnswers: JSON.stringify(answers),
      updatedAt: new Date(),
    };

    if (interviewDate) {
      updateData.interviewDate = interviewDate;
    }

    await db
      .update(trainingApplicationsTable)
      .set(updateData)
      .where(eq(trainingApplicationsTable.id, application.id));

    if (passed) {
      const updatedApp = { ...application, ...updateData, interviewDate };
      const pdfUrl = await generatePDF(updatedApp);
      await db
        .update(trainingApplicationsTable)
        .set({ pdfUrl })
        .where(eq(trainingApplicationsTable.id, application.id));

      return res.json({
        testStatus: "Passed",
        score,
        total: 10,
        interviewDate: interviewDate!.toISOString(),
        interviewTime: "11:00 AM — 12:00 PM",
        interviewLocation: application.preferredLocation === "Lahore"
          ? "Suite 5,6 Ross Residencia, Canal Road, Lahore"
          : "16th Floor, State Life Building, F-6, Islamabad",
        pdfUrl,
        message: "Congratulations! You have passed the test.",
      });
    }

    return res.json({
      testStatus: "Failed",
      score,
      total: 10,
      message: "Thank you for appearing in the test. We appreciate your effort. Unfortunately, you did not meet the qualifying criteria this time. We encourage you to continue learning and wish you success ahead.",
    });
  } catch (error) {
    console.error("Error submitting test:", error);
    res.status(500).json({ error: "Failed to submit test" });
  }
});

router.get("/", authMiddleware, requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res: any) => {
  try {
    const { status, department, search } = req.query;
    const conditions = [];

    if (status && status !== "all") {
      conditions.push(eq(trainingApplicationsTable.status, status as any));
    }
    if (department && department !== "all") {
      conditions.push(eq(trainingApplicationsTable.preferredDept, department as string));
    }
    if (search) {
      conditions.push(
        sql`(${trainingApplicationsTable.fullName} ILIKE ${"%" + search + "%"} OR ${trainingApplicationsTable.cnic} ILIKE ${"%" + search + "%"} OR ${trainingApplicationsTable.email} ILIKE ${"%" + search + "%"})`
      );
    }

    const applications = await db
      .select()
      .from(trainingApplicationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trainingApplicationsTable.createdAt));

    res.json(applications);
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

router.get("/:id", authMiddleware, requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res: any) => {
  try {
    const [application] = await db
      .select()
      .from(trainingApplicationsTable)
      .where(eq(trainingApplicationsTable.id, parseInt(req.params.id as string)));

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json(application);
  } catch (error) {
    console.error("Error fetching application:", error);
    res.status(500).json({ error: "Failed to fetch application" });
  }
});

router.patch("/:id/status", authMiddleware, requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res: any) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "shortlisted", "rejected", "selected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const [updated] = await db
      .update(trainingApplicationsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(trainingApplicationsTable.id, parseInt(req.params.id as string)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Application not found" });
    }

    let employeeRecord = null;
    if (status === "selected") {
      const existingEmp = await db.select({ id: employeesTable.id })
        .from(employeesTable)
        .where(eq(employeesTable.email, updated.email));

      if (existingEmp.length === 0) {
        const employeeCode = await generateEmployeeCode();
        const nameParts = updated.fullName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || nameParts[0];

        const [newEmp] = await db.insert(employeesTable).values({
          employeeCode,
          firstName,
          lastName,
          email: updated.email,
          phone: updated.mobile,
          department: updated.preferredDept || "Audit",
          designation: "Trainee",
          joiningDate: new Date().toISOString().split("T")[0],
          salary: "0",
          status: "active",
          cnic: updated.cnic,
          address: updated.currentAddress,
          icapRegistrationStatus: updated.icapRegNo ? "Registered" : "Not Registered",
        }).returning();
        employeeRecord = newEmp;
      }
    }

    await logActivity({
      userId: req.user?.id ?? 0,
      userName: req.user?.name ?? "System",
      action: "status_change",
      module: "training_application",
      entityId: updated.id,
      entityType: "training_application",
      description: `Updated training application status to ${status}${employeeRecord ? ` — Employee ${employeeRecord.employeeCode} auto-created` : ""}`,
    });

    res.json({ ...updated, employeeCreated: !!employeeRecord, employeeCode: employeeRecord?.employeeCode || null });
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/:id", authMiddleware, requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res: any) => {
  try {
    const id = parseInt(req.params.id as string);
    const [deleted] = await db.delete(trainingApplicationsTable).where(eq(trainingApplicationsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Application not found" });

    await logActivity({
      userId: req.user?.id ?? 0,
      userName: req.user?.name ?? "System",
      action: "delete",
      module: "training_application",
      entityId: deleted.id,
      entityType: "training_application",
      description: `Deleted training application ${deleted.crn} (${deleted.fullName})`,
    });

    res.json({ message: "Application deleted successfully", id: deleted.id });
  } catch (error) {
    console.error("Error deleting application:", error);
    res.status(500).json({ error: "Failed to delete application" });
  }
});

export default router;
