import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
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
    const { role, status } = req.query;
    let query = db.select({
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
    }).from(usersTable);

    const conditions: any[] = [];
    if (role) conditions.push(eq(usersTable.role, role as any));
    if (status) conditions.push(eq(usersTable.status, status as any));

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
    const { email, name, password, role, phone, mobile, cnic, employeeId } = req.body;

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

router.put("/:id", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, role, phone, mobile, cnic, status, employeeId, password } = req.body;

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

export default router;
