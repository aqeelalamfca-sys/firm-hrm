# HRM & Invoice Management System

## Overview

Enterprise-grade HRM and Invoice Management System for Chartered Accountant firms. Manages employees/trainees, attendance, leave, payroll, clients, and invoices.

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
- `users` - System users (auth, roles)
- `employees` - Employee/trainee master with auto-generated codes (EMP0001)
- `attendance` - Daily attendance records (check-in/out, status)
- `leaves` - Leave applications with approval workflow
- `payroll` - Monthly payroll with attendance-based calculation
- `clients` - Client master with auto-generated codes (CLT0001)
- `invoices` - Invoice lifecycle (Draft → Approved → Issued → Paid)

## Features

### Modules Built:
1. **Authentication** - JWT-based login, role-based access (super_admin, hr_admin, finance_officer, manager, employee)
2. **Employee Management** - Add/edit employees, auto employee codes, department/designation tracking
3. **Attendance** - Mark attendance, check-in/out times, status (present/absent/late/half_day/leave), monthly view
4. **Leave Management** - Apply leave, approval workflow, leave types
5. **Payroll** - Generate monthly payroll, attendance-based calculation, payslip view
6. **Client Management** - Client master, financials tracking
7. **Invoice Management** - Full lifecycle (Draft→Approved→Issued→Paid/Overdue), aging report
8. **Dashboard** - Key metrics, attendance trend chart, invoice summary, recent leaves
9. **Reports** - Attendance, payroll, and invoice reports

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
- `GET/POST /clients` - Client CRUD
- `GET/POST /invoices` - Invoice CRUD
- `PUT /invoices/:id/status` - Status update
- `GET /invoices/aging` - Aging report
- `GET /dashboard/stats` - Dashboard metrics
- `GET /dashboard/attendance-trend` - Trend data
- `GET /dashboard/invoice-summary` - Invoice analytics

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root with `pnpm run typecheck`.

## Development

- `pnpm --filter @workspace/api-server run dev` - Start API server
- `pnpm --filter @workspace/hrm-system run dev` - Start frontend
- `pnpm --filter @workspace/db run push` - Push DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` - Regenerate API client
