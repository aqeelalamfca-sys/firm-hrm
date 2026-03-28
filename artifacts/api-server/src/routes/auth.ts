import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { logActivity } from "../middleware/activity-logger";

const router = Router();

const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "hrm_salt_2024").digest("hex");
}

function generateToken(userId: number): string {
  const payload = JSON.stringify({ userId, ts: Date.now(), exp: Date.now() + TOKEN_EXPIRY_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifyToken(token: string): { userId: number; ts: number; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(payloadB64).digest("base64url");
  if (signature !== expectedSig) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (decoded.exp && decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.email, email));
  const user = users[0];

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = generateToken(user.id);

  await logActivity({
    userId: user.id,
    userName: user.name,
    action: "login",
    module: "auth",
    description: `User ${user.name} (${user.email}) logged in`,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId,
    },
  });
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: "Invalid or expired token" });

    const users = await db.select().from(usersTable).where(eq(usersTable.id, decoded.userId));
    const user = users[0];
    if (!user) return res.status(401).json({ error: "User not found" });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
