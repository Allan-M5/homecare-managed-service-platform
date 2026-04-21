import mongoose from "mongoose";
import {
  WORKER_ACCOUNT_STATUS_VALUES,
  WORKER_ACCOUNT_STATUSES,
  WORKER_AVAILABILITY_STATUS_VALUES,
  WORKER_AVAILABILITY_STATUSES
} from "../constants/worker.js";
import { SERVICE_CATEGORIES } from "../constants/services.js";

const workerLocationSchema = new mongoose.Schema(
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
    }
  ,
    googlePinUrl: {
      type: String,
      trim: true,
      default: ""
    }},
  { _id: false }
);

const availabilitySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: WORKER_AVAILABILITY_STATUS_VALUES,
      default: WORKER_AVAILABILITY_STATUSES.OFFLINE
    },
    reason: {
      type: String,
      trim: true,
      default: ""
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    availableAt: {
      type: Date,
      default: null
    },
    autoSwitch: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const profilePhotoDisplaySchema = new mongoose.Schema(
  {
    zoom: {
      type: Number,
      min: 0.5,
      max: 3,
      default: 1
    },
    offsetX: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    offsetY: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    }
  },
  { _id: false }
);

const workerMetricsSchema = new mongoose.Schema(
  {
    totalJobsCompleted: {
      type: Number,
      default: 0,
      min: 0
    },
    totalJobsDeclined: {
      type: Number,
      default: 0,
      min: 0
    },
    totalJobsCancelled: {
      type: Number,
      default: 0,
      min: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    punctualityScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100
    },
    complaintCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { _id: false }
);

const workerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerApplication",
      default: null
    },
    homeLocation: {
      type: workerLocationSchema,
      required: true
    },
    currentLocation: {
      type: workerLocationSchema,
      default: () => ({})
    },
    serviceCategories: {
      type: [String],
      enum: SERVICE_CATEGORIES,
      default: []
    },
    accountStatus: {
      type: String,
      enum: WORKER_ACCOUNT_STATUS_VALUES,
      default: WORKER_ACCOUNT_STATUSES.ACTIVE
    },
    availability: {
      type: availabilitySchema,
      default: () => ({})
    },
    preferredWorkRadiusKm: {
      type: Number,
      min: 1,
      max: 100,
      default: 10
    },
    canBringOwnSupplies: {
      type: Boolean,
      default: false
    },
    
    nextOfKinName: {
      type: String,
      trim: true,
      default: ""
    },
    nextOfKinPhone: {
      type: String,
      trim: true,
      default: ""
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
mpesaNumber: {
      type: String,
      trim: true,
      default: ""
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
    profilePhotoDisplay: {
      type: profilePhotoDisplaySchema,
      default: () => ({})
    },
    metrics: {
      type: workerMetricsSchema,
      default: () => ({})
    },
    adminNotes: {
      type: String,
      trim: true,
      default: ""
    },
    suspensionReason: {
      type: String,
      trim: true,
      default: ""
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    profileAuditTrail: {
      type: [
        {
          actorRole: {
            type: String,
            trim: true,
            default: ""
          },
          actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
          },
          actorName: {
            type: String,
            trim: true,
            default: ""
          },
          reason: {
            type: String,
            trim: true,
            default: ""
          },
          changes: {
            type: [String],
            default: []
          },
          at: {
            type: Date,
            default: Date.now
          }
        }
      ],
      default: []
    },
    lastKnownEtaMinutes: {
      type: Number,
      default: null,
      min: 0
    },
    isLiveLocationEnabled: {
      type: Boolean,
      default: true
    },
    payoutHistory: [
      {
        jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
        amount: { type: Number, default: 0 },
        mpesaMessage: { type: String, trim: true, default: "" },
        paidAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true
  }
);

workerProfileSchema.index({ userId: 1 }, { unique: true });
workerProfileSchema.index({ accountStatus: 1, "availability.status": 1 });
workerProfileSchema.index({ serviceCategories: 1 });
workerProfileSchema.index({
  "homeLocation.latitude": 1,
  "homeLocation.longitude": 1
});

const WorkerProfile =
  mongoose.models.WorkerProfile || mongoose.model("WorkerProfile", workerProfileSchema);

export default WorkerProfile;

