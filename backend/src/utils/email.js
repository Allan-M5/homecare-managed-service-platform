export async function sendTemporaryPasswordEmail({ to, fullName, temporaryPassword }) {
  const subject = "HomeCare password recovery";
  const text = [
    `Hello ${fullName || "there"},`,
    "",
    "A password recovery request was completed for your HomeCare account.",
    `Temporary password: ${temporaryPassword}`,
    "",
    "Sign in using your phone number and this temporary password, then change it immediately.",
    "",
    "If you did not request this, contact support immediately."
  ].join("\n");

  const smtpHost = process.env.SMTP_HOST || "";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "no-reply@homecare.local";

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        text
      });

      return {
        sent: true,
        previewText: ""
      };
    } catch (error) {
      console.error("SMTP email send failed. Falling back to console preview.", error);
    }
  }

  console.log("=== HOMECARE TEMP PASSWORD EMAIL PREVIEW ===");
  console.log("TO:", to);
  console.log("SUBJECT:", subject);
  console.log(text);
  console.log("=== END EMAIL PREVIEW ===");

  return {
    sent: false,
    previewText: text
  };
}
