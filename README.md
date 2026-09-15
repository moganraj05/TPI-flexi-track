# FlexiTrack

Department-based Yes/No attendance poll for flexi workers in manufacturing.

## Stack

- **Backend:** Node.js, Express, MongoDB
- **Mobile:** Expo, React Native (employee app)

## Project Structure

```
flexitrack/
├── backend/     # API server
└── mobile/      # Employee mobile app (Expo)
```

## Prerequisites

- Node.js 18+
- MongoDB running locally (or MongoDB Atlas URI in `.env`)

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # if .env doesn't exist
npm run seed           # creates test departments, workers, and today's poll
npm run dev            # starts API on http://localhost:5000
```

## Mobile App Setup

```bash
cd mobile
npm install
npm start
```

Then press `w` for web, or scan QR for Expo Go on your phone.

### API URL for physical device

If testing on a real phone, update `mobile/constants/theme.ts`:

```ts
export const API_BASE_URL = 'http://YOUR_PC_IP:5000/api';
```

## Test Employee Accounts

| Employee ID | Password    | Department  |
|-------------|-------------|-------------|
| EMP001      | password123 | Production  |
| EMP002      | password123 | Production  |
| EMP003      | password123 | Packing     |

## Employee Features (Phase 1)

- Login with Employee ID + password
- View today's department poll
- Answer **Yes** (coming) or **No** (not coming)
- Change answer before poll closes
- View response history
- Profile and logout

## API Endpoints (Employee)

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | `/api/auth/login`               | Login                    |
| GET    | `/api/auth/me`                  | Current user profile     |
| GET    | `/api/employee/polls/today`     | Today's open poll        |
| POST   | `/api/employee/polls/:id/respond` | Submit Yes/No answer   |
| GET    | `/api/employee/responses/mine`    | Response history         |

## Next Steps

- Supervisor dashboard
- Super Admin panel
- Push notifications
- Auto-generated reports after poll closes
