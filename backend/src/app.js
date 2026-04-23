import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import workerApplicationRoutes from "./routes/workerApplicationRoutes.js";
import adminWorkerApplicationRoutes from "./routes/adminWorkerApplicationRoutes.js";
import adminDirectoryRoutes from "./routes/adminDirectoryRoutes.js";
import adminAccountRoutes from "./routes/adminAccountRoutes.js";
import workerRoutes from "./routes/workerRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import profileManagementRoutes from "./routes/profileManagementRoutes.js";

const app = express();

const allowedOrigins = new Set([
  env.FRONTEND_URL,
  "https://homecare-frontend.onrender.com",
  "http://localhost:5173",
  "http://localhost:5000",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost"
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "HomeCare API is running"
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/worker-applications", workerApplicationRoutes);
app.use("/api/admin/worker-applications", adminWorkerApplicationRoutes);
app.use("/api/admin/directory", adminDirectoryRoutes);
app.use("/api/admin/accounts", adminAccountRoutes);
app.use("/api/worker", workerRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/profile", profileManagementRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;