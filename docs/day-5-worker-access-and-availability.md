# Day 5 Worker Access and Availability

Added:
- mustChangePassword field on user
- change password endpoint
- worker dashboard endpoint
- worker availability update endpoint
- worker current location update endpoint

Routes:
- PATCH /api/auth/change-password
- GET /api/worker/dashboard
- PATCH /api/worker/availability
- PATCH /api/worker/location