import { Router } from "express";
import { db } from "@workspace/db";
import {
  tasksTable,
  taskLogsTable,
  clientsTable,
  engagementsTable,
  usersTable,
  employeesTable,
} from "@workspace/db";
import { eq, desc, and, sql, gte, lte, or } from "drizzle-orm";
import { requireRoles, type AuthenticatedRequest } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";
import { createNotification } from "./notifications";

const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 100,
  partner: 90,
  hr_admin: 70,
  manager: 60,
  finance_officer: 50,
  employee: 30,
  trainee: 10,
};

function canAssign(assignerRole: string, targetRole: string, assignerJoining?: string | null, targetJoining?: string | null): { allowed: boolean; reason?: string } {
  const assignerLevel = ROLE_HIERARCHY[assignerRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;

  if (assignerRole === "super_admin") return { allowed: true };

  if (assignerRole === "partner") {
    if (targetLevel >= ROLE_HIERARCHY.partner) {
      return { allowed: false, reason: "Partners can only assign to subordinates" };
    }
    return { allowed: true };
  }

  if (assignerRole === "manager") {
    if (targetLevel <= ROLE_HIERARCHY.employee) return { allowed: true };
    return { allowed: false, reason: "Managers can only assign to employees and trainees" };
  }

  if (assignerRole === "trainee" || assignerRole === "employee") {
    if (targetLevel > ROLE_HIERARCHY.employee) {
      return { allowed: false, reason: "Cannot assign tasks to seniors (manager and above)" };
    }
    if (!assignerJoining || !targetJoining) {
      return { allowed: false, reason: "Joining date information required for peer assignment" };
    }
    const assignerDate = new Date(assignerJoining);
    const targetDate = new Date(targetJoining);
    const monthsDiff = (assignerDate.getFullYear() - targetDate.getFullYear()) * 12 + (assignerDate.getMonth() - targetDate.getMonth());
    if (monthsDiff >= 0 && monthsDiff <= 5) return { allowed: true };
    if (monthsDiff > 5) {
      return { allowed: false, reason: "Cannot assign to someone who joined more than 5 months before you" };
    }
    return { allowed: true };
  }

  if (assignerLevel > targetLevel) return { allowed: true };
  return { allowed: false, reason: "Cannot assign tasks to users of equal or higher rank" };
}

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId, engagementId, status, priority, assignedTo, startDate, endDate } = req.query;
    const conditions: any[] = [];

    if (clientId) conditions.push(eq(tasksTable.clientId, Number(clientId)));
    if (engagementId) conditions.push(eq(tasksTable.engagementId, Number(engagementId)));
    if (status) conditions.push(eq(tasksTable.status, status as any));
    if (priority) conditions.push(eq(tasksTable.priority, priority as any));
    if (assignedTo) conditions.push(eq(tasksTable.assignedTo, Number(assignedTo)));

    if (startDate && endDate) {
      conditions.push(
        or(
          and(gte(tasksTable.startDate, startDate as string), lte(tasksTable.startDate, endDate as string)),
          and(gte(tasksTable.dueDate, startDate as string), lte(tasksTable.dueDate, endDate as string)),
          and(lte(tasksTable.startDate, startDate as string), gte(tasksTable.dueDate, endDate as string))
        )
      );
    }

    const user = req.user!;
    if (user.role === "trainee" || user.role === "employee") {
      conditions.push(eq(tasksTable.assignedTo, user.id));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const tasks = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        clientId: tasksTable.clientId,
        clientName: clientsTable.name,
        engagementId: tasksTable.engagementId,
        engagementTitle: engagementsTable.title,
        assignedTo: tasksTable.assignedTo,
        assignedToName: sql<string>`(SELECT name FROM users WHERE id = ${tasksTable.assignedTo})`,
        assignedBy: tasksTable.assignedBy,
        assignedByName: sql<string>`(SELECT name FROM users WHERE id = ${tasksTable.assignedBy})`,
        roleLevel: tasksTable.roleLevel,
        startDate: tasksTable.startDate,
        dueDate: tasksTable.dueDate,
        status: tasksTable.status,
        priority: tasksTable.priority,
        progressPercentage: tasksTable.progressPercentage,
        remarks: tasksTable.remarks,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
      })
      .from(tasksTable)
      .leftJoin(clientsTable, eq(tasksTable.clientId, clientsTable.id))
      .leftJoin(engagementsTable, eq(tasksTable.engagementId, engagementsTable.id))
      .where(whereClause)
      .orderBy(desc(tasksTable.createdAt));

    const today = new Date().toISOString().split("T")[0];
    const enriched = tasks.map((t) => ({
      ...t,
      isOverdue: t.status !== "completed" && t.dueDate < today,
      status: t.status !== "completed" && t.dueDate < today ? "delayed" : t.status,
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const conditions: any[] = [];

    if (user.role === "trainee" || user.role === "employee") {
      conditions.push(eq(tasksTable.assignedTo, user.id));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const allTasks = await db.select().from(tasksTable).where(whereClause);

    const today = new Date().toISOString().split("T")[0];
    const total = allTasks.length;
    const pending = allTasks.filter((t) => t.status === "pending").length;
    const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
    const completed = allTasks.filter((t) => t.status === "completed").length;
    const overdue = allTasks.filter((t) => t.status !== "completed" && t.dueDate < today).length;
    const critical = allTasks.filter((t) => t.priority === "critical" && t.status !== "completed").length;
    const dueToday = allTasks.filter((t) => t.dueDate === today && t.status !== "completed").length;

    res.json({ total, pending, inProgress, completed, overdue, critical, dueToday });
  } catch (error) {
    console.error("Error fetching task stats:", error);
    res.status(500).json({ error: "Failed to fetch task stats" });
  }
});

router.get("/eligible-users", async (req: AuthenticatedRequest, res) => {
  try {
    const currentUser = req.user!;
    const allUsers = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        role: usersTable.role,
        status: usersTable.status,
        employeeId: usersTable.employeeId,
      })
      .from(usersTable)
      .where(eq(usersTable.status, "active"));

    const employeeRows = await db
      .select({
        id: employeesTable.id,
        joiningDate: employeesTable.joiningDate,
        designation: employeesTable.designation,
      })
      .from(employeesTable);

    const empMap = new Map<number, { joiningDate: string; designation: string }>();
    for (const emp of employeeRows) {
      empMap.set(emp.id, { joiningDate: emp.joiningDate, designation: emp.designation });
    }

    const currentUserEmp = currentUser.employeeId ? empMap.get(currentUser.employeeId) : null;
    const currentUserJoining = currentUserEmp?.joiningDate || null;

    const eligible = allUsers
      .filter((u) => u.id !== currentUser.id)
      .map((u) => {
        const targetEmp = u.employeeId ? empMap.get(u.employeeId) : null;
        const targetJoining = targetEmp?.joiningDate || null;
        const check = canAssign(currentUser.role, u.role, currentUserJoining, targetJoining);

        let seniorityTag = "Peer";
        if (currentUserJoining && targetJoining) {
          const cDate = new Date(currentUserJoining);
          const tDate = new Date(targetJoining);
          const monthsDiff = (cDate.getFullYear() - tDate.getFullYear()) * 12 + (cDate.getMonth() - tDate.getMonth());
          if (monthsDiff > 2) seniorityTag = "Senior";
          else if (monthsDiff < -2) seniorityTag = "Junior";
        }

        return {
          id: u.id,
          name: u.name,
          role: u.role,
          joiningDate: targetJoining,
          designation: targetEmp?.designation || null,
          seniorityTag,
          eligible: check.allowed,
          reason: check.reason || null,
        };
      });

    res.json(eligible);
  } catch (error) {
    console.error("Error fetching eligible users:", error);
    res.status(500).json({ error: "Failed to fetch eligible users" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [task] = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        clientId: tasksTable.clientId,
        clientName: clientsTable.name,
        engagementId: tasksTable.engagementId,
        engagementTitle: engagementsTable.title,
        assignedTo: tasksTable.assignedTo,
        assignedToName: sql<string>`(SELECT name FROM users WHERE id = ${tasksTable.assignedTo})`,
        assignedBy: tasksTable.assignedBy,
        assignedByName: sql<string>`(SELECT name FROM users WHERE id = ${tasksTable.assignedBy})`,
        roleLevel: tasksTable.roleLevel,
        startDate: tasksTable.startDate,
        dueDate: tasksTable.dueDate,
        status: tasksTable.status,
        priority: tasksTable.priority,
        progressPercentage: tasksTable.progressPercentage,
        remarks: tasksTable.remarks,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
      })
      .from(tasksTable)
      .leftJoin(clientsTable, eq(tasksTable.clientId, clientsTable.id))
      .leftJoin(engagementsTable, eq(tasksTable.engagementId, engagementsTable.id))
      .where(eq(tasksTable.id, id));

    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

router.post(
  "/",
  requireRoles("super_admin", "partner", "manager", "hr_admin", "employee", "trainee"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { title, description, clientId, engagementId, assignedTo, startDate, dueDate, priority, remarks } = req.body;

      if (!title || !startDate || !dueDate) {
        return res.status(400).json({ error: "Title, start date, and due date are required" });
      }

      if (assignedTo) {
        const [targetUser] = await db.select({ role: usersTable.role, employeeId: usersTable.employeeId }).from(usersTable).where(eq(usersTable.id, assignedTo));
        if (targetUser) {
          const currentUser = req.user!;
          let currentJoining: string | null = null;
          let targetJoining: string | null = null;

          if (currentUser.employeeId) {
            const [emp] = await db.select({ joiningDate: employeesTable.joiningDate }).from(employeesTable).where(eq(employeesTable.id, currentUser.employeeId));
            if (emp) currentJoining = emp.joiningDate;
          }
          if (targetUser.employeeId) {
            const [emp] = await db.select({ joiningDate: employeesTable.joiningDate }).from(employeesTable).where(eq(employeesTable.id, targetUser.employeeId));
            if (emp) targetJoining = emp.joiningDate;
          }

          const check = canAssign(currentUser.role, targetUser.role, currentJoining, targetJoining);
          if (!check.allowed) {
            return res.status(403).json({ error: check.reason || "You are not authorized to assign tasks to this user" });
          }
        }
      }

      let roleLevel: string | null = null;
      if (assignedTo) {
        const [assignee] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, assignedTo));
        if (assignee) roleLevel = assignee.role;
      }

      const [task] = await db.insert(tasksTable).values({
        title,
        description: description || null,
        clientId: clientId || null,
        engagementId: engagementId || null,
        assignedTo: assignedTo || null,
        assignedBy: req.user!.id,
        roleLevel,
        startDate,
        dueDate,
        priority: priority || "medium",
        remarks: remarks || null,
      }).returning();

      await db.insert(taskLogsTable).values({
        taskId: task.id,
        action: "created",
        performedBy: req.user!.id,
        details: `Task "${title}" created`,
      });

      await logActivity({
        userId: req.user!.id,
        userName: req.user!.name,
        action: "create",
        module: "tasks",
        entityId: task.id,
        entityType: "task",
        description: `Created task "${title}"`,
        ipAddress: req.ip,
      });

      if (assignedTo && assignedTo !== req.user!.id) {
        await createNotification({
          userId: assignedTo,
          type: "task_assigned",
          title: "New Task Assigned",
          message: `You have been assigned task "${title}" by ${req.user!.name}`,
          relatedEntityType: "task",
          relatedEntityId: task.id,
        });
      }

      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  }
);

router.put("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const user = req.user!;
    if (user.role === "trainee" || user.role === "employee") {
      if (existing.assignedTo !== user.id) {
        return res.status(403).json({ error: "You can only update tasks assigned to you" });
      }
      const { status, progressPercentage, remarks } = req.body;
      const updateData: any = { updatedAt: new Date() };
      if (status) updateData.status = status;
      if (progressPercentage !== undefined) updateData.progressPercentage = progressPercentage;
      if (remarks !== undefined) updateData.remarks = remarks;

      const [updated] = await db.update(tasksTable).set(updateData).where(eq(tasksTable.id, id)).returning();

      if (status && status !== existing.status) {
        await db.insert(taskLogsTable).values({
          taskId: id,
          action: "status_changed",
          performedBy: user.id,
          details: `Status changed from ${existing.status} to ${status}`,
          oldValues: JSON.stringify({ status: existing.status }),
          newValues: JSON.stringify({ status }),
        });

        if (existing.assignedBy && existing.assignedBy !== user.id) {
          await createNotification({
            userId: existing.assignedBy,
            type: "task_status_changed",
            title: "Task Status Updated",
            message: `Task "${existing.title}" status changed to ${status} by ${user.name}`,
            relatedEntityType: "task",
            relatedEntityId: id,
          });
        }
      }

      return res.json(updated);
    }

    const { title, description, clientId, engagementId, assignedTo, startDate, dueDate, status, priority, progressPercentage, remarks } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (clientId !== undefined) updateData.clientId = clientId || null;
    if (engagementId !== undefined) updateData.engagementId = engagementId || null;
    if (startDate !== undefined) updateData.startDate = startDate;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (progressPercentage !== undefined) updateData.progressPercentage = progressPercentage;
    if (remarks !== undefined) updateData.remarks = remarks;

    if (assignedTo !== undefined && assignedTo !== existing.assignedTo) {
      if (assignedTo) {
        const [targetUser] = await db.select({ role: usersTable.role, employeeId: usersTable.employeeId }).from(usersTable).where(eq(usersTable.id, assignedTo));
        if (targetUser) {
          let currentJoining: string | null = null;
          let targetJoining: string | null = null;
          if (user.employeeId) {
            const [emp] = await db.select({ joiningDate: employeesTable.joiningDate }).from(employeesTable).where(eq(employeesTable.id, user.employeeId));
            if (emp) currentJoining = emp.joiningDate;
          }
          if (targetUser.employeeId) {
            const [emp] = await db.select({ joiningDate: employeesTable.joiningDate }).from(employeesTable).where(eq(employeesTable.id, targetUser.employeeId));
            if (emp) targetJoining = emp.joiningDate;
          }
          const check = canAssign(user.role, targetUser.role, currentJoining, targetJoining);
          if (!check.allowed) {
            return res.status(403).json({ error: check.reason || "You are not authorized to assign tasks to this user" });
          }
        }
      }

      updateData.assignedTo = assignedTo || null;
      updateData.assignedBy = user.id;
      if (assignedTo) {
        const [assignee] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, assignedTo));
        if (assignee) updateData.roleLevel = assignee.role;
      }
      await db.insert(taskLogsTable).values({
        taskId: id,
        action: "reassigned",
        performedBy: user.id,
        details: `Task reassigned`,
        oldValues: JSON.stringify({ assignedTo: existing.assignedTo }),
        newValues: JSON.stringify({ assignedTo }),
      });

      if (assignedTo && assignedTo !== user.id) {
        await createNotification({
          userId: assignedTo,
          type: "task_assigned",
          title: "Task Reassigned to You",
          message: `Task "${existing.title}" has been reassigned to you by ${user.name}`,
          relatedEntityType: "task",
          relatedEntityId: id,
        });
      }
    }

    if (status && status !== existing.status) {
      const logAction = status === "completed" ? "completed" : "status_changed";
      await db.insert(taskLogsTable).values({
        taskId: id,
        action: logAction,
        performedBy: user.id,
        details: `Status changed from ${existing.status} to ${status}`,
        oldValues: JSON.stringify({ status: existing.status }),
        newValues: JSON.stringify({ status }),
      });

      if (existing.assignedTo && existing.assignedTo !== user.id) {
        await createNotification({
          userId: existing.assignedTo,
          type: "task_status_changed",
          title: "Task Status Updated",
          message: `Task "${existing.title}" status changed to ${status} by ${user.name}`,
          relatedEntityType: "task",
          relatedEntityId: id,
        });
      }
    }

    if (Object.keys(updateData).length > 1) {
      await db.insert(taskLogsTable).values({
        taskId: id,
        action: "updated",
        performedBy: user.id,
        details: `Task updated`,
      });
    }

    const [updated] = await db.update(tasksTable).set(updateData).where(eq(tasksTable.id, id)).returning();

    await logActivity({
      userId: user.id,
      userName: user.name,
      action: "update",
      module: "tasks",
      entityId: id,
      entityType: "task",
      description: `Updated task "${updated.title}"`,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete(
  "/:id",
  requireRoles("super_admin", "partner", "manager"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
      if (!existing) return res.status(404).json({ error: "Task not found" });

      await db.delete(taskLogsTable).where(eq(taskLogsTable.taskId, id));
      await db.delete(tasksTable).where(eq(tasksTable.id, id));

      await logActivity({
        userId: req.user!.id,
        userName: req.user!.name,
        action: "delete",
        module: "tasks",
        entityId: id,
        entityType: "task",
        description: `Deleted task "${existing.title}"`,
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  }
);

router.get("/:id/logs", async (req: AuthenticatedRequest, res) => {
  try {
    const taskId = Number(req.params.id);
    const logs = await db
      .select({
        id: taskLogsTable.id,
        taskId: taskLogsTable.taskId,
        action: taskLogsTable.action,
        performedBy: taskLogsTable.performedBy,
        performedByName: sql<string>`(SELECT name FROM users WHERE id = ${taskLogsTable.performedBy})`,
        details: taskLogsTable.details,
        oldValues: taskLogsTable.oldValues,
        newValues: taskLogsTable.newValues,
        createdAt: taskLogsTable.createdAt,
      })
      .from(taskLogsTable)
      .where(eq(taskLogsTable.taskId, taskId))
      .orderBy(desc(taskLogsTable.createdAt));

    res.json(logs);
  } catch (error) {
    console.error("Error fetching task logs:", error);
    res.status(500).json({ error: "Failed to fetch task logs" });
  }
});

export default router;
