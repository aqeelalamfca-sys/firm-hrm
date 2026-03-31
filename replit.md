# HRM & Invoice Management System

## Overview

This project is an enterprise-grade Human Resources Management (HRM) and Invoice Management System designed for Chartered Accountant firms. Its primary purpose is to streamline and manage various internal operations including employee and trainee administration, attendance tracking, leave management, payroll processing, client relationship management, invoicing, engagement tracking, document management, and comprehensive audit trails. The system incorporates a robust Role-Based Access Control (RBAC) system to ensure data security and appropriate access levels for different user types.

The system aims to modernize the administrative and financial processes within CA firms, enabling greater efficiency, accuracy, and compliance. Key capabilities include automated payroll calculations with tax considerations, full invoice lifecycle management, secure client credential storage, and a dynamic task allocation system.

## User Preferences

I prefer iterative development. Before making any major changes, please ask for my approval. Ensure detailed explanations for complex implementations. Do not make changes to files within the `artifacts-monorepo/artifacts/api-server/src/middleware/` folder unless specifically instructed. Do not make changes to files within `lib/api-zod` and `lib/api-client-react` as these are auto-generated.

## System Architecture

The project is structured as a monorepo using pnpm workspaces, consisting of a React-based frontend (`hrm-system`) and an Express.js backend (`api-server`). PostgreSQL is used as the primary database, managed by Drizzle ORM.

**Frontend:**
- Developed with React, Vite, Tailwind CSS, and shadcn/ui for a modern and responsive user interface.
- Utilizes Recharts for data visualization, React Hook Form with Zod for form management and validation, and Framer Motion for animations.
- Wouter v3 is used for client-side routing.
- UI/UX features include a global header filter for departments, color-coded badges, and role-specific dashboard views. The design emphasizes clarity and efficiency for administrative tasks.
- **Typography**: Plus Jakarta Sans (display/headings) + Inter Variable (body) loaded from Google Fonts with optical sizing.
- **Design System**: Professional animations (scroll-reveal via IntersectionObserver `RevealOnScroll` component in `landing.tsx`), glassmorphism effects (`.glass` CSS class), card hover effects (`.card-hover`), gradient text utilities (`.text-gradient`), button glow effects (`.btn-glow`), and floating orb background animations. All animation classes defined in `index.css` with `prefers-reduced-motion` fallbacks.

**Backend:**
- Built with Express 5, providing RESTful API endpoints.
- Drizzle ORM interfaces with PostgreSQL, managing a comprehensive database schema that includes users, employees, attendance, leaves, payroll, clients, invoices, engagements, documents, tasks, and audit logs.
- Features HMAC-SHA256 signed tokens for authentication and robust RBAC implemented via middleware on all API routes.
- Security enhancements include Helmet security headers, AES-256-CBC encryption for sensitive client credentials, rate limiting, and structured logging with Pino.
- Performance is optimized through N+1 query elimination strategies (e.g., batched queries, SQL-level filtering), extensive database indexing, and frontend memoization.

**Key Features & Implementations:**
- **Authentication & RBAC:** Secure login with HMAC-signed tokens, granular role-based access control for all API routes and UI elements.
- **Employee & Trainee Management:** Comprehensive CRUD operations for employees with auto-generated codes, detailed profiles, and tracking. Includes a 9-step CA training application process with file uploads, CRN generation, MCQ assessment, and smart interview scheduling.
- **Attendance & Leave Management:** Daily attendance recording with IP capture, and an approval workflow for leave applications.
- **Payroll System:** Monthly payroll generation with Pakistan income tax slab calculation and detailed payslips.
- **Client & Invoice Management:** Client master with financial details, and a full invoice lifecycle (Draft, Approved, Issued, Paid) with WHT/GST tax calculations and aging reports.
- **Engagement & Task Management:** Tracking client engagements through their lifecycle and a task scheduler with calendar/list/week views, priority levels, and dynamic, seniority-based task allocation.
- **Document Management:** Version-controlled document storage with categories, soft delete (trash and restore functionality), and permanent deletion.
- **Role-Based Data Isolation:** Employees and trainees can only view their own records (leaves, employee profile). Only admins/HR/managers/partners can view all records and approve/reject leaves. Employee creation/editing restricted to admin roles.
- **Trainee-to-Employee Auto-Linking:** When a training application status is changed to "selected", an employee record is automatically created with data from the application (name, email, phone, CNIC, department, ICAP status).
- **ICAP/Articles Tracking:** Employee records include ICAP registration status (Registered/Not Registered/In Progress/Exempted), articles ending date, and articles extension period fields.
- **Audit Trail:** Comprehensive logging of all system actions for accountability and compliance.
- **Credential Vault:** Secure, encrypted storage for client portal credentials (e.g., FBR, SECP, PRA logins).
- **Notifications:** In-app notification system with real-time updates for important events.
- **Reports:** Generation of various reports for attendance, payroll, and invoices.
- **Regulatory Live Updates:** AI-powered regulatory intelligence panel on the landing page with live ticker and category cards (FBR/SECP/PSX/SBP). Admin CRUD page at `/regulatory-updates` for managing updates manually or via AI generation.
- **System Settings:** Admin settings page at `/settings` with ChatGPT API key management (stored securely, never returned in API responses) and storage provider configuration.

**Regulatory Updates System:**
- Frontend panel: `artifacts/hrm-system/src/components/regulatory-live-panel.tsx`
- Admin page: `artifacts/hrm-system/src/pages/regulatory-updates.tsx`
- Settings page: `artifacts/hrm-system/src/pages/settings.tsx` (AI Integration + Auto-Gen Config + Storage Configuration)
- Backend routes: `artifacts/api-server/src/routes/regulatory-updates.ts`, `artifacts/api-server/src/routes/system-settings.ts`
- Scheduler: `artifacts/api-server/src/scheduler/auto-regulatory.ts` (auto-generates updates every N hours)
- DB schema: `lib/db/src/schema/regulatory_updates.ts` (tables: `regulatory_updates`, `auto_gen_logs`, `system_settings`)
- AI uses Replit AI Integration proxy (env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`) or falls back to `chatgpt_api_key` from system_settings table
- Auto-gen runs on server startup, configurable via Settings (enable/disable, interval 1-24h)
- Settings page has "Test" button to verify API key connectivity
- Regulatory Updates admin page has "Run Now" button and "View Logs" for auto-gen history
- Config keys in `system_settings`: `auto_gen_enabled`, `auto_gen_interval_hours`, `chatgpt_api_key`

**Pakistan Tax Calculator:**
- Public page at `/tax-calculator` (no auth required)
- Source: `artifacts/hrm-system/src/pages/tax-calculator.tsx`
- Route registered in `App.tsx` as lazy-loaded component
- Action button on landing page right sidebar (blue "Calculate Now" card)
- 10 tabs: AI Analyzer, Tax Exposure, Income Tax, WHT Calc, Sales Tax, Property, Vehicle, Investment, Rental, Rate Tables
- All rates per Finance Act 2025 (FBR Rate Card) with ATL/Non-ATL global toggle
- Covers 80+ WHT categories including Sec 148, 149, 150, 151, 152, 153, 154, 155, 156, 231B, 233, 234, 236C, 236K, 236CB, 236G, 236H, 236Y, 236Z
- Property tax supports ATL/Non-ATL/Late Filer with slab-based rates
- Salary tax uses progressive slabs with surcharge for income >10M

**Law-Integrated AI Tax Engine (First Tab):**
- Backend: `artifacts/api-server/src/routes/tax-analyze.ts` — POST `/api/tax-analyze`
- Accepts PDF, Images (JPG/PNG/WebP/GIF), Excel (.xlsx/.xls), CSV uploads via multer (15MB limit)
- PDF text extraction via `pdf-parse`, Excel via `xlsx`, Images sent as base64 to GPT-4o vision
- Uses Replit AI Integration proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`), falls back to `chatgpt_api_key` from system_settings (VPS)
- **Law-Integrated System Prompt** with full Pakistan tax law knowledge base:
  - ITO 2001 (all WHT sections: 148-156A, 231A-236K), Income Tax Rules 2002
  - Sales Tax Act 1990 (Sec 3, schedules), Sales Tax Rules 2006
  - Provincial Sales Tax (PRA 16%, SRB 13%, KPRA 15%, BRA 15%)
  - Federal Excise Act 2005, Finance Act 2025
- **Multi-Tax Mapping Engine**: Transaction → Nature → Law(s) → Section(s) → Rate(s) → Treatment
- **Mandatory Legal Fields**: Every tax finding must include `applicable_law`, `section_reference`, `source_text` (law citation), `legal_basis` (Confirmed / Insufficient)
- **Compliance Check**: `missing_tax_check` array flags non-deducted taxes
- **Server-side Validation**: Enforces mandatory fields, auto-sets "Insufficient legal basis" for missing section references
- **Improved Error Handling**: Specific messages for HTTP 400/429/500/502/503 from OpenAI API, content filter detection
- Returns structured JSON: document_summary, extracted_items, tax_analysis (with applicable_law, section_reference, source_text, legal_basis, ATL/Non-ATL rates, adjustability, risk flags), compliance_notes, missing_tax_check, total_tax_exposure
- Frontend: full-screen modal popup for results with legal citations section (BookOpen icon), missing tax check section (ShieldAlert icon), Confirmed/Review legal basis badges
- Route mounted before auth middleware (public endpoint, same as tax calculator page)

## Deployment & CI/CD

**Pipeline**: Replit → GitHub → GitHub Actions → Hostinger VPS (Docker)

- **GitHub Repo**: https://github.com/aqeelalamfca-sys/firm-hrm
- **VPS**: Hostinger Ubuntu 22.04 (187.77.130.117)
- **Domain**: ana-ca.com
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`) — auto-deploys on push to `main`
- **Containers**: `ana-backend` (5002:5000), `ana-db` (5433:5432)
- **Docker files**: `deploy/Dockerfile`, `deploy/docker-compose.yml`
- **Nginx**: Running inside `auditwise-nginx` container (shared with other apps); ana-ca.com block in `/opt/auditwise/nginx/nginx-ssl.conf` and `/opt/auditwise/nginx/default.conf`; proxies to Docker DNS `ana-backend:5000` via `resolver 127.0.0.11` (NOT hardcoded IP)
- **SSL**: Let's Encrypt cert at `/opt/auditwise/nginx/ssl/ana-ca.com/` (expires Jun 26, 2026)
- **DB Password**: Set via `.env` file in `/root/apps/ana-ca/deploy/` (`DB_PASSWORD=ANA_Secure_DB_2024!`)
- **Admin Login**: `admin@calfirm.com` / `Admin@123`
- **Docker Network**: `ana-backend` auto-joins `auditwise_auditwise` external network via docker-compose config
- **JWT**: Uses `JWT_SECRET` env var (set in deploy `.env`); tokens valid 7 days with auto-refresh at 2 days remaining
- **Deploy Steps**: Sync source → `docker compose build --no-cache ana-backend` → `docker compose up -d --force-recreate ana-backend` (network auto-joins)
- **Token storage key**: Frontend uses `hrm_token` in localStorage (NOT `auth_token`)
- **Full guide**: `deploy/DEPLOY.md`

## External Dependencies

- **Database:** PostgreSQL
- **Frontend Framework:** React
- **UI Component Library:** shadcn/ui
- **Styling:** Tailwind CSS
- **API Framework:** Express
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **API Codegen:** Orval (from OpenAPI spec)
- **Charts:** Recharts
- **Form Management:** React Hook Form
- **Animations:** Framer Motion
- **Routing:** Wouter
- **Build Tool:** Vite, esbuild
- **Logging:** Pino
- **Encryption:** AES-256-CBC