import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "hrm_salt_2024").digest("hex");
}

export async function seedAdminUser(): Promise<void> {
  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, "admin@calfirm.com"));

    if (existing.length === 0) {
      await db.insert(usersTable).values({
        email: "admin@calfirm.com",
        passwordHash: hashPassword("Admin@123"),
        name: "System Admin",
        role: "super_admin",
        status: "active",
      });
      console.log("[Seed] Admin user created: admin@calfirm.com");
    }
  } catch (err) {
    console.error("[Seed] Failed to seed admin user:", err);
  }
}
