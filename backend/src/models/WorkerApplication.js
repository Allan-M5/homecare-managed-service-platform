import mongoose from "mongoose";
import {
  WORKER_APPLICATION_STATUS_VALUES,
  WORKER_APPLICATION_STATUSES
} from "../constants/worker.js";
import { SERVICE_CATEGORIES } from "../constants/services.js";

const geoLocationSchema = new mongoose.Schema(
  {
    county: {
      type: String,
      trim: true,
      default: ""
    },
    town: {
      type: String,
      trim: true,
      default: ""
    },
    estate: {
      type: String,
      trim: true,
      default: ""
    },
    addressLine: {
      type: String,
      trim: true,
      default: ""
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    googlePlaceId: {
      type: String,
      trim: true,
      default: ""
    },
    googlePinUrl: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { _id: false }
);

const fileAssetSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: ""
    },
    storageKey: {
      type: String,
      trim: true,
      default: ""
    },
    fileName: {
      type: String,
      trim: true,
      default: ""
    },
    mimeType: {
      type: String,
      trim: true,
      default: ""
    },
    uploadedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const workerApplicationSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    alternatePhone: {
      type: String,
      trim: true,
      default: ""
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: ""
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    nationalIdNumber: {
      type: String,
      trim: true,
      required: true
    },
    nextOfKinName: {
      type: String,
      trim: true,
      required: true
    },
    nextOfKinPhone: {
      type: String,
      trim: true,
      required: true
    },
    nextOfKinRelationship: {
      type: String,
      trim: true,
      default: ""
    },
    emergencyContactName: {
      type: String,
      trim: true,
      default: ""
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
      default: ""
    },
    emergencyContactRelationship: {
      type: String,
      trim: true,
      default: ""
    },
    homeLocation: {
      type: geoLocationSchema,
      required: true
    },
    currentRegionEstate: {
      type: String,
      trim: true,
      default: ""
    },
    serviceCategories: {
      type: [String],
      enum: SERVICE_CATEGORIES,
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one service category is required"
      }
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
      max: 80,
      default: 0
    },
    experienceSummary: {
      type: String,
      trim: true,
      default: ""
    },
    canBringOwnSupplies: {
      type: Boolean,
      default: false
    },
    preferredWorkRadiusKm: {
      type: Number,
      min: 1,
      max: 100,
      default: 10
    },
    availableDays: {
      type: [String],
      default: []
    },
    availableTimeNotes: {
      type: String,
      trim: true,
      default: ""
    },
    profilePhoto: {
      type: fileAssetSchema,
      default: () => ({})
    },
    nationalIdFront: {
      type: fileAssetSchema,
      default: () => ({})
    },
    nationalIdBack: {
      type: fileAssetSchema,
      default: () => ({})
    },
    selfieWithId: {
      type: fileAssetSchema,
      default: () => ({})
    },
    mpesaNumber: {
      type: String,
      trim: true,
      default: ""
    },
    bankName: {
      type: String,
      trim: true,
      default: ""
    },
    bankAccountName: {
      type: String,
      trim: true,
      default: ""
    },
    bankAccountNumber: {
      type: String,
      trim: true,
      default: ""
    },
    consentAccepted: {
      type: Boolean,
      required: true,
      validate: {
        validator: (value) => value === true,
        message: "Platform consent must be accepted"
      }
    },
    consentAcceptedAt: {
      type: Date,
      default: Date.now
    },
    consentLocationTracking: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: WORKER_APPLICATION_STATUS_VALUES,
      default: WORKER_APPLICATION_STATUSES.PENDING
    },
    adminReviewNotes: {
      type: String,
      trim: true,
      default: ""
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: ""
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

workerApplicationSchema.index({ phone: 1, status: 1 });
workerApplicationSchema.index({ nationalIdNumber: 1 });
workerApplicationSchema.index({ status: 1, createdAt: -1 });

const WorkerApplication =
  mongoose.models.WorkerApplication ||
  mongoose.model("WorkerApplication", workerApplicationSchema);

export default WorkerApplication;
