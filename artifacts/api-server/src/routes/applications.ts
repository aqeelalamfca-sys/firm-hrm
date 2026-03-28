import { Router } from "express";
import { db } from "@workspace/db";
import { trainingApplicationsTable } from "@workspace/db";
import { eq, desc, sql, ilike, and } from "drizzle-orm";
import { type AuthenticatedRequest, authMiddleware, requireRoles } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";
import path from "path";
import fs from "fs";
import multer from "multer";

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "applications");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadFields = upload.fields([
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

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
      return res.status(409).json({ error: "An application with this CNIC already exists" });
    }

    const [application] = await db.insert(trainingApplicationsTable).values({
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

    res.status(201).json({ message: "Application submitted successfully", id: application.id });
  } catch (error: any) {
    console.error("Application submission error:", error);
    res.status(500).json({ error: error.message || "Failed to submit application" });
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
      .where(eq(trainingApplicationsTable.id, parseInt(req.params.id)));

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
      .where(eq(trainingApplicationsTable.id, parseInt(req.params.id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Application not found" });
    }

    await logActivity(req, "update", "training_application", updated.id, { status });

    res.json(updated);
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;
