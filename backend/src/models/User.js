import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { USER_ROLE_VALUES } from "../constants/roles.js";
import { sanitizePhone } from "../utils/sanitizePhone.js";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      set: sanitizePhone
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false
    },
    role: {
      type: String,
      enum: USER_ROLE_VALUES,
      required: true
    },
    isPhoneVerified: {
      type: Boolean,
      default: false
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    },
    totpSecret: {
      type: String,
      default: "",
      select: false
    },
    totpEnabled: {
      type: Boolean,
      default: false
    },
    totpEnabledAt: {
      type: Date,
      default: null
    },
    lastPasswordResetAt: {
      type: Date,
      default: null
    },
    accountStatus: {
      type: String,
      enum: ["active", "inactive", "suspended", "pending", "blacklisted", "deleted", "DEACTIVATED_BY_USER", "DELETED_BY_ADMIN"],
      default: "active"
    },
    deletionReason: {
      type: String,
      trim: true,
      default: ""
    },
    deletedAt: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    suspendedReason: {
      type: String,
      trim: true,
      default: ""
    },
    suspendedAt: {
      type: Date,
      default: null
    },
    reactivatedAt: {
      type: Date,
      default: null
    },
    reactivationNote: {
      type: String,
      trim: true,
      default: ""
    },
    riskFlags: {
      type: [String],
      default: []
    },
    isSuperAdmin: {
      type: Boolean,
      default: false
    },
    adminCreatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    recoveryKeyHash: {
      type: String,
      default: "",
      select: false
    },
    adminActionAudit: {
      type: [
        {
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
          action: {
            type: String,
            trim: true,
            default: ""
          },
          targetId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
          },
          targetLabel: {
            type: String,
            trim: true,
            default: ""
          },
          metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
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

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, accountStatus: 1 });

userSchema.pre("save", async function preSave(next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
