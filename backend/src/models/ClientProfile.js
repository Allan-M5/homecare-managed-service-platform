import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: ""
    },
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
    houseDetails: {
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
  },
  { _id: false }
);

const emergencyContactSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      default: ""
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    relationship: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { _id: false }
);

const clientProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    defaultLocation: {
      type: locationSchema,
      default: () => ({})
    },
    emergencyContact: {
      type: emergencyContactSchema,
      default: () => ({})
    },
    notesForAdmin: {
      type: String,
      trim: true,
      default: ""
    },
    riskScore: {
      type: Number,
      default: 0,
      min: 0
    },
    lastBookingAt: {
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
    }
  },
  {
    timestamps: true
  }
);

clientProfileSchema.index({ userId: 1 }, { unique: true });

const ClientProfile =
  mongoose.models.ClientProfile || mongoose.model("ClientProfile", clientProfileSchema);

export default ClientProfile;