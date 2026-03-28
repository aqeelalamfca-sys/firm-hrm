import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { requireRoles, type AuthenticatedRequest } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "hrm_salt_2024").digest("hex");
}

router.get("/", requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const { role, status, departmentId } = req.query;
    let query = db.select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      employeeId: usersTable.employeeId,
      departmentId: usersTable.departmentId,
      phone: usersTable.phone,
      mobile: usersTable.mobile,
      cnic: usersTable.cnic,
      profilePicture: usersTable.profilePicture,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    }).from(usersTable);

    const conditions: any[] = [];
    if (role) conditions.push(eq(usersTable.role, role as any));
    if (status) conditions.push(eq(usersTable.status, status as any));
    if (departmentId) conditions.push(eq(usersTable.departmentId, Number(departmentId)));

    if (conditions.length > 0) {
      for (const c of conditions) {
        query = query.where(c) as any;
      }
    }

    const users = await query;
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/:id", requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const user = (await db.select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      employeeId: usersTable.employeeId,
      phone: usersTable.phone,
      mobile: usersTable.mobile,
      cnic: usersTable.cnic,
      profilePicture: usersTable.profilePicture,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, Number(req.params.id))))[0];

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.post("/", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const { email, name, password, role, phone, mobile, cnic, employeeId, departmentId } = req.body;

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) return res.status(400).json({ error: "Email already exists" });

    const [user] = await db.insert(usersTable).values({
      email,
      name,
      passwordHash: hashPassword(password),
      role,
      phone: phone || null,
      mobile: mobile || null,
      cnic: cnic || null,
      employeeId: employeeId || null,
      departmentId: departmentId || null,
    }).returning();

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "create",
      module: "users",
      entityId: user.id,
      entityType: "user",
      description: `Created user ${name} (${email}) with role ${role}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId,
      departmentId: user.departmentId,
      phone: user.phone,
      mobile: user.mobile,
      cnic: user.cnic,
      profilePicture: user.profilePicture,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.post("/bulk-upload", requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const { users: usersData } = req.body;
    if (!Array.isArray(usersData) || usersData.length === 0) {
      return res.status(400).json({ error: "No users provided" });
    }
    if (usersData.length > 200) {
      return res.status(400).json({ error: "Maximum 200 users per upload" });
    }

    const validRoles = ["super_admin", "partner", "hr_admin", "finance_officer", "manager", "employee", "trainee"];
    const departments = await db.select().from(departmentsTable);
    const deptMap = new Map(departments.map(d => [d.name.toLowerCase(), d.id]));

    const results: { row: number; name: string; status: "created" | "skipped"; reason?: string }[] = [];
    let created = 0;

    for (let i = 0; i < usersData.length; i++) {
      const row = usersData[i];
      const name = (row.name || "").trim();
      const email = (row.email || "").trim().toLowerCase();
      const password = (row.password || "").trim();
      const role = (row.role || "employee").trim().toLowerCase().replace(/\s+/g, "_");
      const phone = (row.phone || "").trim();
      const mobile = (row.mobile || "").trim();
      const cnic = (row.cnic || "").trim();
      const deptName = (row.department || "").trim().toLowerCase();

      if (!name || !email) {
        results.push({ row: i + 2, name: name || `Row ${i + 2}`, status: "skipped", reason: "Name and email are required" });
        continue;
      }
      if (!password) {
        results.push({ row: i + 2, name, status: "skipped", reason: "Password is required" });
        continue;
      }
      if (!validRoles.includes(role)) {
        results.push({ row: i + 2, name, status: "skipped", reason: `Invalid role: ${row.role}` });
        continue;
      }

      const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
      if (existing.length > 0) {
        results.push({ row: i + 2, name, status: "skipped", reason: "Email already exists" });
        continue;
      }

      let departmentId: number | null = null;
      if (deptName) {
        const found = deptMap.get(deptName);
        if (!found) {
          results.push({ row: i + 2, name, status: "skipped", reason: `Invalid department: ${row.department}` });
          continue;
        }
        departmentId = found;
      }

      await db.insert(usersTable).values({
        email,
        name,
        passwordHash: hashPassword(password),
        role: role as any,
        phone: phone || null,
        mobile: mobile || null,
        cnic: cnic || null,
        departmentId,
      });

      results.push({ row: i + 2, name, status: "created" });
      created++;
    }

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "create",
      module: "users",
      entityType: "user",
      description: `Bulk uploaded ${created} users (${usersData.length - created} skipped)`,
      ipAddress: req.ip,
    });

    res.json({ total: usersData.length, created, skipped: usersData.length - created, results });
  } catch (error) {
    console.error("Error bulk uploading users:", error);
    res.status(500).json({ error: "Failed to bulk upload users" });
  }
});

router.put("/profile", async (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, mobile, cnic, profilePicture } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (mobile !== undefined) updateData.mobile = mobile;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;

    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, req.user!.id)).returning();

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId,
      phone: user.phone,
      mobile: user.mobile,
      cnic: user.cnic,
      profilePicture: user.profilePicture,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.put("/change-password", async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = (await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)))[0];

    if (user.passwordHash !== hashPassword(currentPassword)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    await db.update(usersTable).set({
      passwordHash: hashPassword(newPassword),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.user!.id));

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

router.put("/:id", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, role, phone, mobile, cnic, status, employeeId, password, departmentId } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (phone !== undefined) updateData.phone = phone;
    if (mobile !== undefined) updateData.mobile = mobile;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (status) updateData.status = status;
    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (password) updateData.passwordHash = hashPassword(password);
    if (departmentId !== undefined) updateData.departmentId = departmentId || null;

    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "User not found" });

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "update",
      module: "users",
      entityId: id,
      entityType: "user",
      description: `Updated user ${user.name}`,
      ipAddress: req.ip,
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId,
      phone: user.phone,
      mobile: user.mobile,
      cnic: user.cnic,
      profilePicture: user.profilePicture,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
