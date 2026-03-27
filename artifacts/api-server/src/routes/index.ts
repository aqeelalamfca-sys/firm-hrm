import { Router, type IRouter } from "express";
import { authMiddleware, requireRoles } from "../middleware/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import employeesRouter from "./employees";
import attendanceRouter from "./attendance";
import leavesRouter from "./leaves";
import payrollRouter from "./payroll";
import clientsRouter from "./clients";
import invoicesRouter from "./invoices";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";
import activityLogsRouter from "./activity-logs";
import clientCredentialsRouter from "./client-credentials";
import engagementsRouter from "./engagements";
import documentsRouter from "./documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);

router.use(authMiddleware);

router.use("/employees", employeesRouter);
router.use("/attendance", attendanceRouter);
router.use("/leaves", leavesRouter);
router.use("/payroll", payrollRouter);
router.use("/clients", clientsRouter);
router.use("/invoices", invoicesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/users", usersRouter);
router.use("/activity-logs", activityLogsRouter);
router.use("/clients/:clientId/credentials", clientCredentialsRouter);
router.use("/engagements", engagementsRouter);
router.use("/documents", documentsRouter);

export default router;
