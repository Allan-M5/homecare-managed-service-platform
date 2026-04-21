export const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`
  });
};

export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err?.code === 11000) {
    statusCode = 409;
    const key = Object.keys(err.keyPattern || err.keyValue || {})[0] || "account detail";
    if (key === "phone") {
      message = "An account with that phone number already exists.";
    } else if (key === "email") {
      message = "An account with that email already exists. You can continue without email or use a different one.";
    } else {
      message = "Those account details are already in use.";
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: err.details || null,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
};