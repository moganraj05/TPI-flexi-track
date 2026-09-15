# FlexiTrack — 30-Day Project Plan

**Prepared for:** Management Review  
**Project:** FlexiTrack (Flexi Worker Attendance Poll System)  
**Timeline:** 30 Days  
**Pilot Department:** TCD (220 employees)

---

## Project Goal

Enable department incharges to send **Yes/No attendance polls** to flexi workers before each shift, so manpower can be arranged **before production starts**.

---

## Application Model

| Layer | Technology | Users |
|-------|-----------|--------|
| Mobile App | Expo / React Native | Workers + Incharges |
| Web Admin Panel | React / Expo Web | Super Admin, HR, Management |
| Backend API | Node.js + Express + MongoDB | All platforms |

**Current status:** Employee + Incharge mobile modules built  
**Planned:** Super admin panel, auto reports, production push notifications

---

## 30-Day Gantt Chart

| Phase | Start | End | Activities |
|-------|-------|-----|------------|
| Discovery & Data Collection | Day 1 | Day 7 | HR meetings, department meetings, data templates |
| Core App Development | Day 5 | Day 16 | Employee app, incharge module, backend API |
| Incharge + Notifications | Day 12 | Day 20 | Push notifications, poll engine |
| Admin Panel + Reports | Day 18 | Day 25 | Super admin, PDF/Excel reports |
| UAT & Pilot (TCD) | Day 22 | Day 28 | Live testing with TCD department |
| Go-Live & Training | Day 29 | Day 30 | Production deploy, incharge training |

### Week-by-Week Plan

| Week | Days | Key Activities |
|------|------|----------------|
| Week 1 | 1–7 | Requirements, HR & department meetings, data collection |
| Week 2 | 8–14 | Employee app, incharge poll creation, backend, MongoDB |
| Week 3 | 15–21 | Push notifications, super admin, reports, web dashboard |
| Week 4 | 22–28 | TCD pilot testing, bug fixes, security review, training |
| Go-Live | 29–30 | Production deploy, incharge training, employee rollout |

---

## Process Flow

1. Incharge creates poll (title, date, shift, open/close time, description)
2. Push notification sent to all workers in that department
3. Workers open app → tap **Yes** (coming) or **No** (not coming)
4. Incharge monitors real-time: **Coming / Not coming / Pending**
5. Before shift starts → arrange backup workers for gaps
6. Poll closes → auto report generated for HR and management

---

## Example: TCD Department (220 Employees)

| Shift | Workers | Hours | Poll Deadline |
|-------|---------|-------|---------------|
| Morning | 80 | 12hr | 2 hrs before shift start |
| Night | 80 | 12hr | 2 hrs before shift start |
| Shift A | 20 | 8hr | 1 hr before shift |
| Shift B | 20 | 8hr | 1 hr before shift |
| Shift C | 20 | 8hr | 1 hr before shift |
| **Total** | **220** | | |

### Planning Advantage

If **15 of 80** morning workers answer "No", the incharge arranges **15 replacements before the line starts** — avoiding production delay.

---

## Data to Collect from Company

| Data Item | Owner | Priority |
|-----------|-------|----------|
| Employee master list (ID, name, phone, department, shift) | HR | Critical |
| Department list with codes and incharge mapping | HR + Dept Heads | Critical |
| Shift timings and rotation rules per department | Department Heads | Critical |
| Flexi worker vs permanent employee classification | HR | Critical |
| Plant/unit location and timezone | Admin | High |
| Holiday calendar and off-day rules | HR | High |
| Minimum manpower required per shift | Dept Heads | High |
| Existing attendance / gate entry process | HR + Security | Medium |
| Company logo and branding assets | Admin | Medium |
| IT network policy (WiFi, firewall, device policy) | IT | High |

---

## Meetings Required

| Meeting | When | Attendees | Outcome |
|---------|------|-----------|---------|
| Kick-off with Management | Day 1 | HOD, HR Head, IT | Approve scope, timeline, pilot dept |
| HR — Employee Data | Day 2–3 | HR team | Employee list format, flexi rules |
| Department Heads — All Depts | Day 3–5 | Each dept incharge/HOD | Shift patterns, team size, poll timing |
| TCD Department Deep Dive | Day 5 | TCD Incharge, HR | 220-worker shift model |
| IT Infrastructure | Day 6 | IT team | Hosting, API access, push policy |
| UAT Review | Day 25 | Pilot users + management | Sign-off before go-live |
| Go-Live & Training | Day 29 | All incharges | Hands-on training, support plan |

---

## External Support Needed to Go Live

| Area | Provider | Purpose | Est. Cost |
|------|----------|---------|-----------|
| Cloud Database | MongoDB Atlas | Store employees, polls, responses | Free tier → paid on scale |
| API Server | AWS / Azure / DigitalOcean | Host Node.js backend 24/7 | ₹1,500–5,000/mo |
| Mobile App Build | Expo EAS Build | APK for Android (push notifications) | Free tier |
| Push Notifications | Expo Push / FCM | Alert workers when poll opens | Free |
| Domain + SSL | GoDaddy / Cloudflare | API & web admin URL | ~₹1,000/yr |
| Web Admin Hosting | Vercel / Netlify | Super admin dashboard | Free–low cost |
| SMS (optional) | MSG91 / Twilio | Backup alerts | Pay per SMS |
| Play Store (optional) | Google Play Console | Official app distribution | ₹2,100 one-time |
| Company IT | Internal IT | Firewall, WiFi, device approval | Internal |
| HR Support | HR department | Employee data, onboarding | Internal |

---

## Key Advantages for Management

1. Know who is coming **before shift starts** — arrange backup workers in advance
2. Department-wise visibility: Coming / Not coming / Pending in real time
3. Reduce last-minute manpower shortage on production lines
4. Multiple incharges manage their own teams independently
5. Digital record replaces manual phone calls and WhatsApp messages
6. Reports generated after poll closes — useful for HR and management audit
7. Scalable to all departments once TCD pilot succeeds

---

## Ask Management For

1. **HR contact** — for employee data
2. **TCD incharge** — as pilot champion
3. **IT contact** — for server hosting approval
4. **Budget approval** — ~₹3,000–5,000/month for cloud hosting
5. **30-day timeline approval** — with TCD as pilot department

---

## Test Accounts (Development)

| Role | ID | Password | Department |
|------|-----|----------|------------|
| Incharge | INC001 | password123 | Production |
| Incharge | INC002 | password123 | Packing |
| Worker | EMP001 | password123 | Production |
| Worker | EMP002 | password123 | Production |
| Worker | EMP003 | password123 | Packing |

---

*Document generated for FlexiTrack project — TPI*
