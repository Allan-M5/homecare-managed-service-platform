import { Router } from "express";
import multer from "multer";
import { submitWorkerApplication } from "../controllers/workerApplicationController.js";

const router = Router();

const allowedImageMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      cb(new Error("Only JPG, PNG, or WEBP image uploads are allowed for worker verification files."));
      return;
    }

    cb(null, true);
  }
});

router.post(
  "/",
  upload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "nationalIdFront", maxCount: 1 },
    { name: "nationalIdBack", maxCount: 1 },
    { name: "selfieWithId", maxCount: 1 }
  ]),
  submitWorkerApplication
);

export default router;

