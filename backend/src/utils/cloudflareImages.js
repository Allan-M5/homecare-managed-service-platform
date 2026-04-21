import fs from "fs/promises";

const hasCloudflareConfig = () =>
  Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_IMAGES_API_TOKEN
  );

export const uploadImageToCloudflareIfConfigured = async (file, folder = "worker-applications") => {
  if (!file) return null;

  if (!hasCloudflareConfig()) {
    return {
      provider: "local",
      fileName: file.originalname || file.filename || "upload",
      url: "",
      mimeType: file.mimetype || "",
      size: file.size || 0
    };
  }

  const formData = new FormData();
  const buffer = await fs.readFile(file.path);
  const blob = new Blob([buffer], { type: file.mimetype || "application/octet-stream" });

  formData.append("file", blob, file.originalname || file.filename || "upload");
  formData.append("requireSignedURLs", "false");
  formData.append("metadata", JSON.stringify({ folder }));

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_IMAGES_API_TOKEN}`
    },
    body: formData
  });

  const data = await response.json();
  if (!response.ok || !data?.success || !data?.result) {
    throw new Error(data?.errors?.[0]?.message || "Cloudflare image upload failed.");
  }

  return {
    provider: "cloudflare",
    fileName: file.originalname || file.filename || "upload",
    url: data.result.variants?.[0] || "",
    cloudflareImageId: data.result.id,
    mimeType: file.mimetype || "",
    size: file.size || 0
  };
};
