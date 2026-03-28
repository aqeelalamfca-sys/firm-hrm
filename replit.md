# HRM & Invoice Management System

## Overview

Enterprise-grade HRM and Invoice Management System for Chartered Accountant firms. Manages employees/trainees, attendance, leave, payroll, clients, invoices, engagements, documents, and audit trails with full RBAC.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Animations**: Framer Motion
- **Routing**: Wouter v3

## Login Credentials (Demo Accounts)

- **Admin** (Super Admin): admin@calfirm.com / admin123
- **Partner**: partner@calfirm.com / partner123
- **HR** (HR Admin): hr@calfirm.com / hr123
- **Finance**: finance@calfirm.com / finance123
- **Manager**: manager@calfirm.com / manager123
- **Employee**: employee@calfirm.com / employee123
- **Trainee**: trainee@calfirm.com / trainee123

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── hrm-system/         # React + Vite frontend (HRM & Invoice System)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

Tables:
- `users` - System users (auth, roles, phone, mobile, cnic, profilePicture, status)
- `employees` - Employee/trainee master with auto-generated codes (EMP0001)
- `attendance` - Daily attendance records (check-in/out, status, ipAddress)
- `leaves` - Leave applications with approval workflow
- `payroll` - Monthly payroll with attendance-based calculation (overtimeHours, overtimePay, taxAmount)
- `clients` - Client master with auto-generated codes (CLT0001), NTN, registrationNo
- `invoices` - Invoice lifecycle (Draft → Approved → Issued → Paid), WHT/GST amounts, recurring support
- `activity_logs` - Complete audit trail of all system actions
- `client_credentials` - Encrypted credential vault (FBR, SECP, PRA logins) using AES-256-CBC
- `engagements` - Client engagement tracking (audit, tax, advisory) with lifecycle management
- `engagement_assignments` - Team member assignments to engagements
- `departments` - Department master (Audit, Tax, Corporate, Advisory, Others) with color coding
- `documents` - Document management with version control, categorization, soft delete (isDeleted/deletedAt/deletedById), and task linking (taskId)
- `tasks` - Tasks with client/engagement links, status tracking, assignment logs
- `task_logs` - Immutable log of all task actions (create, update, reassign, complete)
- `notifications` - In-app notifications with types (task_assigned, task_due, leave_approved, etc.)
- `training_applications` - CA training applications with file uploads (CNIC/photo), academic records, skills assessment, status tracking (pending/shortlisted/rejected/selected)
- `meetings` - Online meeting bookings with partners (public booking, admin management, status workflow: pending/confirmed/completed/cancelled)

## Roles

- `super_admin` - Full system access
- `partner` - Partner-level access (similar to admin)
- `hr_admin` - HR administration
- `finance_officer` - Finance/billing access
- `manager` - Department manager access
- `employee` - Basic employee access
- `trainee` - Limited trainee access

## Features

### Modules Built:
1. **Authentication** - JWT-based login, role-based access
2. **RBAC** - Auth middleware on all API routes, role-based sidebar visibility, role-restricted pages
3. **Employee Management** - Add/edit employees, auto employee codes, department/designation tracking
4. **Attendance** - Mark attendance, check-in/out times, status tracking, IP address capture
5. **Leave Management** - Apply leave, approval workflow, leave types
6. **Payroll** - Generate monthly payroll, Pakistan income tax slab calculation, payslip dialog with full salary breakdown
7. **Client Management** - Client master with NTN, registration number, financials tracking
8. **Invoice Management** - Full lifecycle (Draft→Approved→Issued→Paid/Overdue), WHT/GST tax calculation, aging report
9. **Engagements** - Client engagement tracking with lifecycle (planning→execution→review→completed)
10. **Documents** - Document management with categories, version control (upload new versions, version history)
11. **Audit Trail** - Complete activity logging with filtering by module/action, pagination
12. **User Management** - Admin CRUD for system users with role assignment and status control
13. **Dashboard** - Key metrics, role-specific views (Executive/Finance/HR), attendance trend, invoice summary, task overview
14. **Reports** - Attendance, payroll, and invoice reports
15. **Credential Vault** - Encrypted storage for client portal credentials (FBR, SECP, PRA)
16. **Task Scheduler** - Task management with calendar/list/week views, delayed status detection, priority levels
17. **User Profile** - Profile view/edit, change password, mobile/CNIC fields
18. **Notifications** - In-app notification system with bell icon, unread count badge, mark-read/mark-all-read, auto-refresh every 30s
19. **Dynamic Task Allocation** - Seniority-based assignment rules (Admin→all, Partner→subordinates, Manager→employees/trainees, Trainee→peers within 5 months), eligible-users API with seniority tags
20. **Invoice PDF** - Professional invoice print/download with company header, tax breakdown, and print-to-PDF support
21. **Department System** - 5 departments (Audit/Blue, Tax/Green, Corporate/Purple, Advisory/Orange, Others/Gray) with global header filter, color-coded badges across all pages, department field in all create/edit forms
22. **Document Trash/Restore** - Soft delete (moves to trash), trash view with 30-day retention indicator, restore from trash, permanent delete
23. **CA Training Application** - 9-step application form with file uploads (CNIC/photo), CRN generation (CRN-YYYY-XXXX), duplicate CNIC prevention
24. **MCQ Assessment Test** - 10-question MCQ test (4 Accounting, 2 Audit, 2 Tax, 1 Excel, 1 General), 15-minute timer, auto-evaluation, pass/fail (≥8/10), single attempt enforcement
25. **PDF Result Generation** - Auto-generated firm-branded PDF for passed candidates with application details, test score, and interview schedule
26. **Smart Interview Scheduling** - 7 working days after test (excluding Sundays and Pakistan public holidays), 11:00 AM–12:00 PM slot

### Security:
- Auth middleware protects all API routes (except /auth and /healthz)
- Role-based access control on sensitive routes
- AES-256-CBC encryption for credential vault
- Activity logging on all CRUD operations and login events
- Role-based sidebar navigation (admin sees all, restricted roles see limited menu)
- Rate limiting: 500 requests/15min for API, 20 requests/15min for auth endpoints
- Global error handler with structured logging via pino

## API Routes

All under `/api`:
- `POST /auth/login` - Login
- `GET /auth/me` - Current user
- `GET/POST /employees` - Employee CRUD
- `GET /employees/:id`, `PUT /employees/:id`
- `GET/POST /attendance` - Attendance records
- `GET /attendance/summary` - Monthly summary
- `PUT /attendance/:id` - Correction
- `GET/POST /leaves` - Leave applications
- `PUT /leaves/:id` - Approve/reject
- `GET/POST /payroll` - Payroll records + generate
- `GET /payroll/:id` - Payslip
- `GET/POST /clients` - Client CRUD (with NTN, registrationNo)
- `GET/POST /invoices` - Invoice CRUD (with WHT/GST)
- `PUT /invoices/:id/status` - Status update
- `GET /invoices/aging` - Aging report
- `GET /dashboard/stats` - Dashboard metrics
- `GET /dashboard/attendance-trend` - Trend data
- `GET /dashboard/invoice-summary` - Invoice analytics
- `GET/POST /users` - User management (admin only)
- `PUT /users/profile` - Update own profile
- `PUT /users/change-password` - Change own password
- `PUT /users/:id` - Update user (admin)
- `GET /activity-logs` - Audit trail with filtering
- `GET/POST /clients/:clientId/credentials` - Credential vault
- `PUT/DELETE /clients/:clientId/credentials/:id` - Credential CRUD
- `GET /clients/:clientId/credentials/:id/reveal` - Reveal credential (admin/partner)
- `GET/POST /engagements` - Engagement management
- `PUT /engagements/:id` - Update engagement
- `GET/POST /documents` - Document management
- `POST /documents/:id/version` - Upload new version
- `GET /documents/:id/versions` - Version history
- `DELETE /documents/:id` - Soft delete (move to trash)
- `GET /documents/trash` - Trashed documents with daysRemaining
- `PUT /documents/:id/restore` - Restore from trash
- `DELETE /documents/:id/permanent` - Permanent delete
- `GET /departments` - List all departments
- `GET /departments/:id` - Get department by ID
- `GET/POST /tasks` - Task management (with seniority-based assignment validation)
- `GET /tasks/stats` - Task statistics
- `GET /tasks/eligible-users` - Eligible assignees with seniority tags
- `PUT /tasks/:id` - Update task
- `GET /dashboard/role-stats` - Role-specific dashboard metrics
- `GET /notifications` - User notifications (with unread count)
- `PUT /notifications/:id/read` - Mark notification as read
- `PUT /notifications/read-all` - Mark all notifications as read

## Auth & Middleware

- **JWT Token**: Base64-encoded `{userId, ts}`, stored in localStorage as `hrm_token`
- **Password Hash**: SHA-256 + "hrm_salt_2024"
- **Auth Middleware**: `artifacts/api-server/src/middleware/auth.ts` - applied globally in routes/index.ts
- **Activity Logger**: `artifacts/api-server/src/middleware/activity-logger.ts` - logs actions to activity_logs table
- **Encryption**: `artifacts/api-server/src/utils/encryption.ts` - AES-256-CBC for credential vault

## Frontend Pages

18 pages total:
- `/landing` - Public landing page (firm overview, services, team, contact — accessible without authentication)
- `/login` - Login page
- `/` - Dashboard (role-based: Trainee=Light Blue tasks/attendance, Manager=Green staff/leave approvals, Partner/Admin=Deep Red executive overview with invoices/payroll/staff; all roles get Time In/Out card, leave apply, PKT time)
- `/employees` - Employee management
- `/attendance` - Attendance tracking (with IP capture)
- `/leaves` - Leave management
- `/payroll` - Payroll processing (with tax calculation and payslip dialog)
- `/clients` - Client management (with NTN/Registration fields)
- `/invoices` - Invoice management (with WHT/GST tax support)
- `/reports` - Reports
- `/engagements` - Engagement tracking
- `/documents` - Document management (with version control)
- `/audit-trail` - Audit trail (admin/partner/HR only)
- `/user-management` - User management (admin/partner/HR only)
- `/task-scheduler` - Task scheduler with calendar/list/week views
- `/credential-vault` - Credential vault (admin/partner only)
- `/profile` - User profile with edit and change password

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root with `pnpm run typecheck`.

## Development

- `pnpm --filter @workspace/api-server run dev` - Start API server
- `pnpm --filter @workspace/hrm-system run dev` - Start frontend
- `pnpm --filter @workspace/db run push` - Push DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` - Regenerate API client
