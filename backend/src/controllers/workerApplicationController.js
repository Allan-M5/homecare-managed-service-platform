import WorkerApplication from "../models/WorkerApplication.js";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "../constants/services.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { uploadWorkerApplicationAsset } from "../services/r2UploadService.js";

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const toArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
};

const emptyFileAsset = () => ({
  url: "",
  storageKey: "",
  fileName: "",
  mimeType: "",
  uploadedAt: null
});

const normalizeCategoryKey = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "_plus_")
    .replace(/[\/\\]/g, "_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^1_/, "one_")
    .replace(/^2_/, "two_")
    .replace(/^3_plus_/, "three_plus_")
    .replace(/house_cleaning/g, "cleaning")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const SERVICE_CATEGORY_LOOKUP = (() => {
  const map = new Map();

  SERVICE_CATEGORIES.forEach((slug) => {
    map.set(normalizeCategoryKey(slug), slug);
  });

  Object.entries(SERVICE_CATEGORY_LABELS).forEach(([slug, label]) => {
    map.set(normalizeCategoryKey(label), slug);
  });

  return map;
})();

const resolveServiceCategory = (value) => {
  const normalized = normalizeCategoryKey(value);
  return SERVICE_CATEGORY_LOOKUP.get(normalized) || null;
};

export const submitWorkerApplication = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const files = req.files || {};

  const fullName = body.fullName?.trim() || "";
  const phone = body.phone?.trim() || "";
  const alternatePhone = body.alternatePhone?.trim() || "";
  const email = body.email?.trim() || "";
  const dateOfBirth = body.dateOfBirth || null;
  const nationalIdNumber = body.nationalIdNumber?.trim() || "";

  const nextOfKinName = body.nextOfKinName?.trim() || "";
  const nextOfKinPhone = body.nextOfKinPhone?.trim() || "";
  const nextOfKinRelationship = body.nextOfKinRelationship?.trim() || "";

  const emergencyContactName = body.emergencyContactName?.trim() || "Neighbor / Friend";
  const emergencyContactPhone = body.emergencyContactPhone?.trim() || body.neighborFriendContact?.trim() || "";
  const emergencyContactRelationship = body.emergencyContactRelationship?.trim() || "Neighbor / Friend";

  const county = body.county?.trim() || "";
  const town = body.town?.trim() || "";
  const estate = body.estate?.trim() || "";
  const addressLine = body.addressLine?.trim() || "";
  const currentRegionEstate = body.currentRegionEstate?.trim() || body.town?.trim() || "";
  const latitude = body.latitude ? Number(body.latitude) : null;
  const longitude = body.longitude ? Number(body.longitude) : null;
  const googlePlaceId = body.googlePlaceId?.trim() || "";
  const googlePinUrl = body.googlePinUrl?.trim() || body.googleMapPinUrl?.trim() || "";

  const rawServiceCategories = toArray(body.serviceCategories);
  const serviceCategories = rawServiceCategories
    .map(resolveServiceCategory)
    .filter(Boolean);

  const invalidCategories = rawServiceCategories.filter((category) => !resolveServiceCategory(category));

  const yearsOfExperience = body.yearsOfExperience ? Number(body.yearsOfExperience) : 0;
  const experienceSummary = body.experienceSummary?.trim() || "";
  const canBringOwnSupplies = toBoolean(body.canBringOwnSupplies);
  const preferredWorkRadiusKm = body.preferredWorkRadiusKm ? Number(String(body.preferredWorkRadiusKm).replace(/[^\d.]/g, "")) : 10;
  const availableDays = toArray(body.availableDays);

  const availableTimeNotes = [
    body.availabilityStartTime ? `Start: ${body.availabilityStartTime}` : "",
    body.availabilityEndTime ? `End: ${body.availabilityEndTime}` : ""
  ].filter(Boolean).join(" | ");

  const mpesaNumber = body.mpesaNumber?.trim() || "";
  const bankName = body.bankName?.trim() || "";
  const bankAccountName = body.bankAccountName?.trim() || body.mpesaRegisteredName?.trim() || "";
  const bankAccountNumber = body.bankAccountNumber?.trim() || body.bankAccountDetails?.trim() || "";

  const consentAccepted = toBoolean(body.consentAccepted);
  const consentLocationTracking = toBoolean(body.consentLocationTracking ?? body.trackingConsentAccepted);

  const missingFields = [];
  if (!fullName) missingFields.push("Full Legal Name");
  if (!phone) missingFields.push("Phone Number");
  if (!email) missingFields.push("Email Address");
  if (!dateOfBirth) missingFields.push("Date of Birth");
  if (!nationalIdNumber) missingFields.push("National ID Number");
  if (!county) missingFields.push("County");
  if (!town) missingFields.push("Town");
  if (!estate) missingFields.push("Estate");
  if (!addressLine) missingFields.push("Address Line");
  if (!nextOfKinName) missingFields.push("Next of Kin Name");
  if (!nextOfKinPhone) missingFields.push("Next of Kin Phone Number");

  if (missingFields.length > 0) {
    throw new AppError("Missing required worker application fields.", 400, {
      missingFields
    });
  }

  if (!Array.isArray(serviceCategories) || serviceCategories.length === 0) {
    throw new AppError("At least one service category must be selected.", 400);
  }

  if (invalidCategories.length > 0) {
    throw new AppError("One or more selected service categories are invalid.", 400, {
      invalidCategories
    });
  }

  if (availableDays.length === 0) {
    throw new AppError("At least one available day is required.", 400);
  }

  if (!availableTimeNotes) {
    throw new AppError("Available start and end time are required.", 400);
  }

  const missingUploadFields = [];

  if (!files.profilePhoto?.[0]) missingUploadFields.push("profilePhoto");
  if (!files.nationalIdFront?.[0]) missingUploadFields.push("nationalIdFront");
  if (!files.nationalIdBack?.[0]) missingUploadFields.push("nationalIdBack");
  if (!files.selfieWithId?.[0]) missingUploadFields.push("selfieWithId");

  if (missingUploadFields.length > 0) {
    throw new AppError("Please upload all required worker verification images.", 400, {
      missingFields: missingUploadFields
    });
  }

  if (consentAccepted !== true) {
    throw new AppError("Platform consent must be accepted.", 400);
  }

  if (consentLocationTracking !== true) {
    throw new AppError("Consent to location-based attendance and live tracking is required.", 400);
  }

  const existingPendingApplication = await WorkerApplication.findOne({
    phone,
    status: { $in: ["pending", "under_review", "needs_more_info"] }
  });

  if (existingPendingApplication) {
    throw new AppError(
      "A worker application for this phone number is already under review.",
      409
    );
  }

  const applicationFolder = `worker-applications/${Date.now()}-${phone.replace(/[^\dA-Za-z]+/g, "") || "candidate"}`;

  const [profilePhotoAsset, nationalIdFrontAsset, nationalIdBackAsset, selfieWithIdAsset] = await Promise.all([
    files.profilePhoto?.[0]
      ? uploadWorkerApplicationAsset({ file: files.profilePhoto[0], folder: applicationFolder, label: "profile-photo" })
      : Promise.resolve(emptyFileAsset()),
    files.nationalIdFront?.[0]
      ? uploadWorkerApplicationAsset({ file: files.nationalIdFront[0], folder: applicationFolder, label: "national-id-front" })
      : Promise.resolve(emptyFileAsset()),
    files.nationalIdBack?.[0]
      ? uploadWorkerApplicationAsset({ file: files.nationalIdBack[0], folder: applicationFolder, label: "national-id-back" })
      : Promise.resolve(emptyFileAsset()),
    files.selfieWithId?.[0]
      ? uploadWorkerApplicationAsset({ file: files.selfieWithId[0], folder: applicationFolder, label: "selfie-with-id" })
      : Promise.resolve(emptyFileAsset())
  ]);

  const application = await WorkerApplication.create({
    fullName,
    phone,
    alternatePhone,
    email,
    dateOfBirth,
    nationalIdNumber,
    nextOfKinName,
    nextOfKinPhone,
    nextOfKinRelationship,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
    homeLocation: {
      county,
      town,
      estate,
      addressLine,
      latitude,
      longitude,
      googlePlaceId,
      googlePinUrl
    },
    currentRegionEstate,
    serviceCategories,
    yearsOfExperience,
    experienceSummary,
    canBringOwnSupplies,
    preferredWorkRadiusKm,
    availableDays,
    availableTimeNotes,
    profilePhoto: profilePhotoAsset,
    nationalIdFront: nationalIdFrontAsset,
    nationalIdBack: nationalIdBackAsset,
    selfieWithId: selfieWithIdAsset,
    mpesaNumber,
    bankName,
    bankAccountName,
    bankAccountNumber,
    consentAccepted,
    consentLocationTracking
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Worker application submitted successfully.",
    data: application
  });
});


