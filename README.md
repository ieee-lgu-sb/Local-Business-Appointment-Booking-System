# Local Business Appointment Booking System

## Overview
This project is a full-stack appointment booking system for local businesses (clinics, salons, consultants). It replaces manual phone/WhatsApp scheduling with role-based login, live slot visibility, and admin controls.

## Current Build Scope (Day 1 to Day 14)
### Customer side
- Signup/login
- Service selection (loaded from backend)
- Date/time selection from availability slots
- Appointment booking with validation feedback
- Appointment history display
- Cancel appointment from history

### Admin side
- Separate `/admin` login page
- Manage services (create/update/activate)
- Manage business availability settings
- Manage appointment statuses
- Daily/monthly analytics and service performance

### Scheduling rules
- Role-based access control (customer/admin)
- Slot must be valid against configured availability
- Outside-hours and break-time booking blocked
- Double booking blocked per service/consultant resource for overlapping time ranges

## Tech Stack
- Frontend: React.js
- Backend: Node.js + Express.js
- Database: MongoDB (Atlas or local)

## Project Structure
```text
backend/
  app/
    config/        # DB connection
    controllers/   # API logic
    middleware/    # auth + RBAC
    models/        # Mongoose schemas
    routes/        # Express routes
    utils/         # scheduling helpers
frontend/
  src/
    App.js              # customer app flow
    AdminDashboard.js   # admin dashboard
```

## Environment Variables
Create `backend/.env` from `backend/.env.example`.

```env
PORT=5000
MONGO_URI=your_primary_mongodb_uri
MONGO_URI_FALLBACK=your_fallback_non_srv_uri
JWT_SECRET=your_long_random_secret
```

## Local Setup
### 1) Backend
```bash
cd backend
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2) Frontend
```bash
cd frontend
npm install
npm start
```
Frontend runs on `http://localhost:3000`.

## API Summary
### Public/customer auth
- `POST /api/auth/signup`
- `POST /api/auth/login`

### Admin auth
- `POST /api/auth/admin/signup`
- `POST /api/auth/admin/login`

### Customer booking flow
- `GET /api/services`
- `GET /api/availability`
- `POST /api/appointments` (auth)
- `GET /api/appointments` (auth)
- `PATCH /api/appointments/:id` (auth)

### Admin management + reports
- `GET /api/admin/services` (admin)
- `POST /api/admin/services` (admin)
- `PATCH /api/admin/services/:id` (admin)
- `GET /api/admin/availability` (admin)
- `PATCH /api/admin/availability` (admin)
- `GET /api/admin/appointments` (admin)
- `PATCH /api/admin/appointments/:id` (admin)
- `GET /api/admin/reports` (admin)

## Reports & Analytics (How It Works)
### Backend flow
- Route protection: `backend/app/routes/admin.js` exposes `GET /api/admin/reports` behind `authenticate` + `requireRole("admin")`.
- Controller: `backend/app/controllers/reportController.js` builds the reports payload.
- Data source: `Appointment` collection with MongoDB aggregation pipelines.

### Report settings used in code
- Daily totals: current day window (`startOfToday` to `startOfTomorrow`).
- Monthly totals: current calendar month (`startOfMonth` to `startOfNextMonth`).
- Daily trend: last 7 days (including today).
- Monthly trend: last 6 months (including current month).
- Status breakdown: `pending`, `approved`, `rescheduled`, `cancelled`, `completed`.
- Service performance: grouped by service with `total`, `completed`, `cancelled`.

### Frontend flow
- Admin dashboard requests reports in `frontend/src/AdminDashboard.js` via `apiRequest("/admin/reports")`.
- KPI cards render totals and completion rate.
- Trend panels render daily/monthly arrays.
- Status panel renders status breakdown.
- Service panel renders service performance entries.

## 14-Day Plan
1. Requirements, feature finalization, GitHub repo
2. Dev environment (React + Node/Express)
3. DB schema (users, services, appointments)
4. Customer auth
5. Admin auth + RBAC
6. Customer UI
7. Appointment APIs
8. Frontend/backend integration
9. Admin dashboard
10. Double booking prevention
11. Customer appointment history
12. Admin reports
13. Cleanup + docs + push
14. Testing + demo + presentation
