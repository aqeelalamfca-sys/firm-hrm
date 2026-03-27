import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    employeeId: number | null;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = JSON.parse(Buffer.from(token, "base64").toString());

    db.select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .then((users) => {
        const user = users[0];
        if (!user) return res.status(401).json({ error: "User not found" });
        if (user.status === "inactive")
          return res.status(403).json({ error: "Account is inactive" });

        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          employeeId: user.employeeId,
        };
        next();
      })
      .catch(() => res.status(401).json({ error: "Invalid token" }));
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
