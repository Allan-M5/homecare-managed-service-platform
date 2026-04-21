# Day 6 Jobs Core

Added:
- job constants
- Job model
- client job creation endpoint
- client my-jobs endpoint
- admin all-jobs endpoint
- admin assign-worker endpoint
- worker assigned-jobs endpoint

Routes:
- POST /api/jobs
- GET /api/jobs/my
- GET /api/jobs/admin/all
- PATCH /api/jobs/admin/:id/assign-worker
- GET /api/jobs/worker/assigned