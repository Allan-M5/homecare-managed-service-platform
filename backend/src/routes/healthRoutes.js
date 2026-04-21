import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "homecare-api",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

export default router;
