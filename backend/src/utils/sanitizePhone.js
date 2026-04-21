export const sanitizePhone = (phone = "") => {
  const cleaned = String(phone).replace(/[^\d+]/g, "").trim();
  return cleaned;
};