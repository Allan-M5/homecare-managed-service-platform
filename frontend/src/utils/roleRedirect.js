export const getRoleHomePath = (role) => {
  switch (role) {
    case "admin":
      return "/admin";
    case "client":
      return "/client";
    case "worker":
      return "/worker";
    default:
      return "/login";
  }
};