# FlexiTrack — Folder Structure, package.json Files, and Prisma Schema

## 1. Project folder structure

```
TPI flexi track/
├── FlexiTrack-30Day-Plan.md
├── FlexiTrack-Project-Brief.md
├── TODO.md
├── README.md
├── CLAUDE_DESIGN.md
├── Sample.md
├── chatgpt.md
├── data-templates/                    # sample CSVs for bulk-loading departments/workers/shifts
│   ├── 00-Field-Definitions.csv
│   ├── 01-Departments.csv
│   ├── 02-Incharges.csv
│   ├── 03-Workers.csv
│   └── 04-Shift-Configuration.csv
│
├── backend/                           # Express API — single source of truth for all clients
│   ├── .env / .env.example
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── index.js                   # app bootstrap: express, http server, socket.io, schedulers
│       ├── realtime.js                # Socket.IO server, room join logic, emit helpers
│       ├── config/
│       │   └── prisma.js              # shared PrismaClient instance
│       ├── middleware/
│       │   ├── auth.js                # authenticate (JWT) + authorize (role check)
│       │   └── errorHandler.js
│       ├── routes/
│       │   ├── auth.routes.js
│       │   ├── employee.routes.js
│       │   ├── incharge.routes.js
│       │   └── hr.routes.js
│       ├── controllers/
│       │   ├── auth.controller.js
│       │   ├── employee.controller.js
│       │   ├── incharge.controller.js
│       │   ├── hr.controller.js
│       │   └── notification.controller.js
│       ├── services/
│       │   ├── poll-automation.service.js   # auto opens/closes shift polls
│       │   ├── reminder.service.js          # pre-close push reminders
│       │   ├── notification.service.js      # Expo push sender
│       │   └── hr-export.service.js         # Excel/PDF export
│       ├── utils/
│       │   ├── date.js
│       │   ├── shift.js
│       │   ├── poll.js
│       │   ├── pollReport.js
│       │   ├── jwt.js
│       │   └── password.js
│       └── scripts/
│           └── seed-design.js
│
├── webfrontend/                       # Production HR web app (React + Vite), served dev on :5174
│   ├── .env / .env.example
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                    # router + providers
│       ├── theme.js
│       ├── api/
│       │   ├── client.js              # axios instance + socket URL resolution
│       │   └── hr.js                  # HR endpoint wrappers
│       ├── context/
│       │   ├── AuthContext.jsx
│       │   ├── SocketContext.jsx
│       │   ├── LiveStatusContext.jsx
│       │   └── ToastContext.jsx
│       ├── components/
│       │   ├── layout/                # AppShell, Sidebar, Topbar, ProtectedRoute
│       │   └── common/                # StatCard, RosterRow, ConfirmDialog, PlantSelect, ...
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── LiveBoard.jsx
│       │   ├── Attendance.jsx
│       │   ├── AttendanceDetail.jsx
│       │   ├── Workforce.jsx
│       │   ├── WorkerDetail.jsx
│       │   ├── InchargeDetail.jsx
│       │   ├── Reports.jsx
│       │   └── Settings.jsx
│       └── utils/
│           ├── format.js
│           └── usePagination.js
│
├── hrfrontend/                        # Legacy HR web app — superseded by webfrontend, port :5173
│   ├── .env / .env.example
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── api/ (client.js, hr.js)
│       ├── context/AuthContext.jsx
│       ├── components/ (layout/, dashboard/, common/)
│       └── pages/ (Login, Dashboard, Attendance, ShiftLive, Reports, Settings)
│
└── mobile/                            # Expo/React Native app — worker + incharge roles
    ├── package.json
    ├── app.json / app.config.js / eas.json
    ├── App.tsx / index.ts
    ├── app/                           # Expo Router file-based routes
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   ├── login.tsx
    │   ├── (tabs)/                    # worker: index, history, profile
    │   ├── (incharge-tabs)/           # incharge: index, team, profile
    │   └── incharge-poll/[id].tsx     # poll detail/report
    ├── components/                    # PollCard, YesNoButtons, incharge/* form widgets, ...
    ├── context/
    │   ├── AuthContext.tsx
    │   ├── ThemeContext.tsx
    │   └── RealtimeContext.tsx
    ├── services/
    │   ├── api.ts
    │   ├── notifications.ts
    │   ├── realtime.ts
    │   └── serverDiscovery.ts
    ├── hooks/usePollCountdown.ts
    ├── utils/ (date.ts, exportPollReport.ts, roles.ts)
    └── types/index.ts
```

*(`node_modules/`, `dist/`, `.git/`, `.expo/`, and `builds/` omitted for readability.)*

---

## 2. package.json files

### `backend/package.json`
```json
{
  "name": "flexitrack-backend",
  "version": "1.0.0",
  "description": "FlexiTrack API - flexi worker attendance polls",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "seed:design": "node src/scripts/seed-design.js"
  },
  "dependencies": {
    "@prisma/client": "^6.19.3",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "exceljs": "^4.4.0",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "pdfkit": "^0.20.2",
    "socket.io": "^4.8.3"
  },
  "devDependencies": {
    "nodemon": "^3.1.4",
    "prisma": "^6.19.3"
  }
}
```

### `webfrontend/package.json`
```json
{
  "name": "webfrontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.102.8",
    "axios": "^1.20.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.3",
    "socket.io-client": "^4.8.3"
  },
  "devDependencies": {
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "vite": "^8.3.0"
  }
}
```

### `hrfrontend/package.json` (legacy, superseded by webfrontend)
```json
{
  "name": "hrfrontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.102.8",
    "axios": "^1.20.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.3"
  },
  "devDependencies": {
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "vite": "^8.3.0"
  }
}
```

### `mobile/package.json`
```json
{
  "name": "mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "dependencies": {
    "@expo/vector-icons": "^15.0.2",
    "@react-native-community/datetimepicker": "9.1.0",
    "expo": "~57.0.18",
    "expo-build-properties": "~57.0.15",
    "expo-constants": "~57.0.16",
    "expo-device": "~57.0.1",
    "expo-file-system": "~57.0.6",
    "expo-linking": "~57.0.8",
    "expo-network": "~57.0.2",
    "expo-notifications": "~57.0.15",
    "expo-router": "~57.0.17",
    "expo-secure-store": "~57.0.2",
    "expo-sharing": "~57.0.17",
    "expo-status-bar": "~57.0.1",
    "expo-updates": "~57.0.19",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-native": "0.86.3",
    "react-native-calendars": "^1.1314.0",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "~4.26.0",
    "react-native-web": "^0.21.2",
    "socket.io-client": "^4.8.3"
  },
  "devDependencies": {
    "@expo/ngrok": "^4.1.3",
    "@types/react": "~19.2.2",
    "typescript": "~6.0.3"
  },
  "scripts": {
    "start": "expo start --host lan",
    "start:offline": "expo start --offline --host lan",
    "start:tunnel": "expo start --tunnel",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "update:preview": "eas update --channel preview",
    "update:production": "eas update --channel production"
  },
  "private": true
}
```

---

## 3. `backend/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  worker
  incharge
  supervisor
  admin
  superadmin
  hr
}

enum PollStatus {
  open
  closed
}

enum ResponseAnswer {
  yes
  no
}

enum FollowUpStatus {
  pending
  contacted
  confirmed_coming
  confirmed_not_coming
}

model Department {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  code      String   @unique
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  users User[]
  polls Poll[]

  @@map("departments")
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  employeeId   String   @unique @map("employee_id")
  name         String
  email        String?  @unique
  phone        String?
  password     String
  role         Role     @default(worker)
  departmentId String?  @map("department_id") @db.Uuid
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  inchargeId   String?  @map("incharge_id") @db.Uuid
  incharge     User?    @relation("WorkerIncharge", fields: [inchargeId], references: [id], onDelete: SetNull)
  reports      User[]   @relation("WorkerIncharge")
  shiftStart   String?  @map("shift_start")
  shiftEnd     String?  @map("shift_end")
  shiftName    String?  @map("shift_name")
  equipment    String?
  process      String?
  pushToken    String?  @map("push_token")
  isActive     Boolean  @default(true) @map("is_active")
  tokenVersion Int      @default(0) @map("token_version")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  pollsCreated      Poll[]     @relation("PollCreatedBy")
  responses         Response[]
  followUpsAsWorker FollowUp[] @relation("FollowUpWorker")
  followUpsUpdated  FollowUp[] @relation("FollowUpUpdatedBy")

  @@map("users")
}

model Poll {
  id                    String     @id @default(uuid()) @db.Uuid
  title                 String
  description           String?
  departmentId          String     @map("department_id") @db.Uuid
  department            Department @relation(fields: [departmentId], references: [id])
  date                  DateTime   @db.Date
  shift                 String     @default("general")
  shiftStart            String?    @map("shift_start")
  shiftEnd              String?    @map("shift_end")
  status                PollStatus @default(open)
  opensAt               DateTime   @map("opens_at")
  closesAt              DateTime   @map("closes_at")
  createdById           String?    @map("created_by") @db.Uuid
  createdBy             User?      @relation("PollCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  autoCreated           Boolean    @default(true) @map("auto_created")
  sendReminder          Boolean    @default(true) @map("send_reminder")
  reminderMinutesBefore Int        @default(30) @map("reminder_minutes_before")
  reminderSentAt        DateTime?  @map("reminder_sent_at")
  createdAt             DateTime   @default(now()) @map("created_at")
  updatedAt              DateTime   @updatedAt @map("updated_at")

  responses Response[]
  followUps FollowUp[]

  @@unique([departmentId, shiftStart, shiftEnd, date], map: "uniq_shift_poll")
  @@map("polls")
}

model Response {
  id         String         @id @default(uuid()) @db.Uuid
  pollId     String         @map("poll_id") @db.Uuid
  poll       Poll           @relation(fields: [pollId], references: [id])
  userId     String         @map("user_id") @db.Uuid
  user       User           @relation(fields: [userId], references: [id])
  answer     ResponseAnswer
  answeredAt DateTime       @default(now()) @map("answered_at")
  createdAt  DateTime       @default(now()) @map("created_at")
  updatedAt  DateTime       @updatedAt @map("updated_at")

  @@unique([pollId, userId])
  @@map("responses")
}

model FollowUp {
  id          String         @id @default(uuid()) @db.Uuid
  workerId    String         @map("worker_id") @db.Uuid
  worker      User           @relation("FollowUpWorker", fields: [workerId], references: [id])
  pollId      String         @map("poll_id") @db.Uuid
  poll        Poll           @relation(fields: [pollId], references: [id])
  status      FollowUpStatus @default(pending)
  note        String?
  updatedById String?        @map("updated_by") @db.Uuid
  updatedBy   User?          @relation("FollowUpUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")

  @@unique([workerId, pollId])
  @@map("followups")
}
```
