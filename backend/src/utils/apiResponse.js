export const sendSuccess = (res, options = {}) => {
  const {
    statusCode = 200,
    message = "Request successful",
    data = null,
    meta = null
  } = options;

  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta
  });
};

export const sendError = (res, options = {}) => {
  const {
    statusCode = 500,
    message = "Request failed",
    errors = null
  } = options;

  return res.status(statusCode).json({
    success: false,
    message,
    errors
  });
};