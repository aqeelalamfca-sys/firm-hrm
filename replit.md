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

## Login Credentials

- **Admin**: admin@calfirm.com / admin123
- **HR**: hr@calfirm.com / hr123
- **Finance**: finance@calfirm.com / finance123

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
- `documents` - Document management with version control and categorization

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
4. **Attendance** - Mark attendance, check-in/out times, status tracking
5. **Leave Management** - Apply leave, approval workflow, leave types
6. **Payroll** - Generate monthly payroll, attendance-based calculation
7. **Client Management** - Client master with NTN, registration number, financials tracking
8. **Invoice Management** - Full lifecycle (Draft→Approved→Issued→Paid/Overdue), aging report
9. **Engagements** - Client engagement tracking with lifecycle (planning→execution→review→completed)
10. **Documents** - Document management with categories (trial balance, general ledger, tax return, etc.)
11. **Audit Trail** - Complete activity logging with filtering by module/action, pagination
12. **User Management** - Admin CRUD for system users with role assignment and status control
13. **Dashboard** - Key metrics, attendance trend chart, invoice summary, recent leaves
14. **Reports** - Attendance, payroll, and invoice reports
15. **Credential Vault** - Encrypted storage for client portal credentials (FBR, SECP, PRA)

### Security:
- Auth middleware protects all API routes (except /auth and /healthz)
- Role-based access control on sensitive routes
- AES-256-CBC encryption for credential vault
- Activity logging on all CRUD operations and login events
- Role-based sidebar navigation (admin sees all, restricted roles see limited menu)

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
- `PUT /users/:id` - Update user
- `GET /activity-logs` - Audit trail with filtering
- `GET/POST /clients/:clientId/credentials` - Credential vault
- `PUT/DELETE /clients/:clientId/credentials/:id` - Credential CRUD
- `GET/POST /engagements` - Engagement management
- `PUT /engagements/:id` - Update engagement
- `GET/POST /documents` - Document management
- `DELETE /documents/:id` - Delete document

## Auth & Middleware

- **JWT Token**: Base64-encoded `{userId, ts}`, stored in localStorage as `hrm_token`
- **Password Hash**: SHA-256 + "hrm_salt_2024"
- **Auth Middleware**: `artifacts/api-server/src/middleware/auth.ts` - applied globally in routes/index.ts
- **Activity Logger**: `artifacts/api-server/src/middleware/activity-logger.ts` - logs actions to activity_logs table
- **Encryption**: `artifacts/api-server/src/utils/encryption.ts` - AES-256-CBC for credential vault

## Frontend Pages

12 pages total:
- `/login` - Login page
- `/` - Dashboard
- `/employees` - Employee management
- `/attendance` - Attendance tracking
- `/leaves` - Leave management
- `/payroll` - Payroll processing
- `/clients` - Client management (with NTN/Registration fields)
- `/invoices` - Invoice management
- `/reports` - Reports
- `/engagements` - Engagement tracking
- `/documents` - Document management
- `/audit-trail` - Audit trail (admin/partner/HR only)
- `/user-management` - User management (admin/partner/HR only)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root with `pnpm run typecheck`.

## Development

- `pnpm --filter @workspace/api-server run dev` - Start API server
- `pnpm --filter @workspace/hrm-system run dev` - Start frontend
- `pnpm --filter @workspace/db run push` - Push DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` - Regenerate API client
