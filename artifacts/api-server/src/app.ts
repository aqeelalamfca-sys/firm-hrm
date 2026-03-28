import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/auth";

const app: Express = express();
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://ana-ca.com", "https://www.ana-ca.com"]
  : undefined;

app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
});

app.use("/uploads/applications", authMiddleware as any);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
  maxAge: "7d",
  etag: true,
}));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

app.all("/api/{*splat}", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(import.meta.dirname, "public");
  app.use(express.static(publicDir, {
    maxAge: "1y",
    immutable: true,
    index: false,
  }));
  app.get("/{*splat}", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ error: "Internal server error" });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

export default app;
