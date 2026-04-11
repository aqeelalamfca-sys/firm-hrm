# HRM & Invoice Management System

## Overview

This project is an enterprise-grade Human Resources Management (HRM) and Invoice Management System designed for Chartered Accountant firms. It streamlines internal operations, including employee and trainee administration, attendance, leave, payroll, client relationship management, invoicing, engagement tracking, document management, and comprehensive audit trails. The system features a robust Role-Based Access Control (RBAC) system for secure data access. Its goal is to enhance efficiency, accuracy, and compliance within CA firms through automated processes, full invoice lifecycle management, secure client credential storage, and dynamic task allocation.

## User Preferences

I prefer iterative development. Before making any major changes, please ask for my approval. Ensure detailed explanations for complex implementations. Do not make changes to files within the `artifacts-monorepo/artifacts/api-server/src/middleware/` folder unless specifically instructed. Do not make changes to files within `lib/api-zod` and `lib/api-client-react` as these are auto-generated.

## System Architecture

The project is structured as a monorepo using pnpm workspaces, consisting of a React-based frontend and an Express.js backend. PostgreSQL is used as the primary database, managed by Drizzle ORM.

**Frontend:**
- Developed with React, Vite, Tailwind CSS, and shadcn/ui for a modern and responsive UI.
- Incorporates Recharts for data visualization, React Hook Form with Zod for form management and validation, and Framer Motion for animations.
- Wouter v3 handles client-side routing.
- UI/UX emphasizes clarity and efficiency with features like a global header filter, color-coded badges, and role-specific dashboard views. The design includes professional animations, glassmorphism effects, card hover effects, gradient text utilities, and button glow effects. Typography uses Plus Jakarta Sans and Inter Variable from Google Fonts.

**Backend:**
- Built with Express 5, providing RESTful API endpoints.
- Drizzle ORM manages a comprehensive PostgreSQL database schema covering users, employees, attendance, leaves, payroll, clients, invoices, engagements, documents, tasks, and audit logs.
- Features HMAC-SHA256 signed tokens for authentication and robust RBAC implemented via middleware.
- **Multi-Provider AI Integration**: Supports OpenAI, Anthropic (Claude), Google (Gemini), DeepSeek, and custom OpenAI-compatible APIs, configured via `system_settings` or environment variables with SSRF protection.
- Security enhancements include Helmet, AES-256-CBC encryption for sensitive data, rate limiting, and structured logging with Pino.
- Performance is optimized through N+1 query elimination, extensive database indexing, and frontend memoization.
- **Backend Hardening**: Includes transactions for atomicity, batch inserts for efficiency, pagination, input validation against enums, RBAC on critical routes, AI rate limiting, consistent error logging and formatting, Drizzle ORM for raw SQL reduction, category-specific file size limits, and type safety for request parameters.
- **AI Working Paper Generator (Audit-Grade Sequential Workflow) — V2 REBUILT**:
    - Features 36 tables for comprehensive audit data, including COA, Audit Engine, WP triggers, sampling, analytics, control, evidence, reconciliation, ISA audit chain, tick marks, review notes, version history, lead schedules, FS note mapping, and compliance gates.
    - **Schema Hardening**: Includes over 70 database indexes, cascade deletes, unique constraints, default values, `updated_at` timestamps, soft delete for ISA 230 compliance, and new pgEnums for improved data integrity.
    - Variable definitions cover 402+ variables across 26 groups (including Subsequent Events ISA 560, Estimates & Judgments ISA 540, Group Audit ISA 600, Disclosure Completeness, IT Environment, Communication ISA 260/265), with 100% auto-fill coverage, tiered confidence scoring, and **6-category source type tracking** (Upload-Filled, Formula-Filled, AI-Filled, Missing, Low Confidence, User Confirmed).
    - **Template-First Architecture**: Uploaded Excel template is the single source of truth — TB/GL generation is optional. Direct template→variables→WP data flow with completeness meter and mandatory field tracker.
    - Supports dynamic WP filtering based on 20 Pakistani entity types and 9 engagement types.
    - Implements a 10-stage flow: Upload → AI Extraction → Data Sheet (COA Engine) → Arranged Data Review → Variables (Lock) → Audit Engine → Head-wise Generation → Audit Chain → Review & QC → Export.
    - **ISA AUDIT SYSTEM**: Includes audit logic chain (`wp_audit_chain`) with ISA clause references, a tick mark system, multi-level review workflow (`wp_review_note`), ISA 230 compliant version control (`wp_version_history`), auto-generated lead schedules, FS note mapping, real-time compliance validation engine (`wp_compliance_gate`), enhanced ISA 530 sampling, and an ISA clause reference library.
    - Features a DATA SHEET STAGE for COA management and an AUDIT ENGINE STAGE with 9 new tables for engagement control, WP trigger matrix, sampling, analytical review, control testing, evidence vault, and reconciliation.
    - Strict upload rules for different file types and OCR detection for scanned PDFs.
    - A comprehensive Audit Variable Engine (370+ variables across 20 groups) with 100% auto-population, validation rules engine, and variable dependency rules.
    - **Comprehensive Input Renderer**: Supports over 40 inputModes for diverse data types and display options, with confidence scoring.
    - **TB & GL Engine**: Production-grade 5-stage pipeline (Input Extraction → CoA Mapping → Trial Balance → General Ledger → Reconciliation) with fuzzy CoA mapping, intelligent balance handling, materiality-aware GL generation, 3-way reconciliation, and enforcement checks.
    - 12 sequential audit heads with dependency gates and an exception center.
    - Export functionality for various formats (Excel, Word, PDF) and a full bundle export.
    - AI prompts are tailored for Pakistan-focused forensic extraction, GL generation, and ISA-compliant WP generation.
- **Key Features & Implementations:** Authentication & RBAC, Employee & Trainee Management (with auto-linking and ICAP tracking), Attendance & Leave Management, Payroll System (with Pakistan tax slabs), Client & Invoice Management, Engagement & Task Management (seniority-based allocation), Version-controlled Document Management, Role-Based Data Isolation, Audit Trail, Credential Vault (encrypted), In-app Notifications, Reports, Regulatory Live Updates (AI-powered with auto-generation and admin CRUD), and System Settings for AI integration and storage.
- **Regulatory Updates System**: AI-powered live panel with admin management, auto-generation scheduler, and configurable settings for AI API keys and intervals.
- **Pakistan Tax Calculator**: Publicly accessible page with 10 tabs covering AI analysis, income tax, WHT, sales tax, property, vehicle, investment, rental, and rate tables (Finance Act 2025).
- **Law-Integrated AI Tax Engine**: Accepts various document uploads (PDF, image, Excel, CSV) for AI analysis using GPT-4o vision. It incorporates a comprehensive Pakistan tax law knowledge base (ITO 2001, Sales Tax Act 1990, Provincial Sales Tax, Federal Excise Act 2005, Finance Act 2025) to provide structured JSON output including legal citations, compliance checks, and tax exposure.
- **Working Papers Wizard**: A 3-section wizard for Upload, Configure (entity/firm details, engagement team, deadlines, financial statements, sales tax, variables), and Output (AI analysis, GL & TB generation, working papers, export). Autosaves drafts to local storage.
    - **Frontend UX Enhancements**: Auto-routing of Excel template uploads through ISA processing endpoint, bulk approve heads and bulk clear review notes (server-side with RBAC), search/filter in Audit Chain, Review Notes, and Version History tabs, CSV export for audit chains/compliance gates/tick marks/review notes, 15-second auto-save timer for variable edits, session duplication button (carry forward to next year), print-optimized CSS with @media print rules, and offline connectivity indicator.

## Production Notes (VPS: ana-ca.com)

- **CI/CD**: Replit → GitHub → VPS pipeline via `scripts/deploy.sh`
- **Secrets stored in Replit Secrets** (do not change names):
  - `GITHUB_TOKEN` — GitHub PAT with repo + workflow scopes
  - `VPS_SSH_KEY` — Ed25519 private key for VPS root user (label: replit-auditwise-deploy)
- **GitHub repo**: `aqeelalamfca-sys/firm-hrm` — GitHub Actions workflow at `.github/workflows/deploy.yml` auto-deploys on push to `main`
- **GitHub Secrets set** (for Actions CI/CD): `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USERNAME`, `VPS_PORT`, `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`
- **Deploy command**: `bash scripts/deploy.sh` — pushes to GitHub then SSH-builds Docker container on VPS
- **Push only**: `bash scripts/push.sh` — GitHub push only, triggers GitHub Actions deploy
- **VPS status**: `bash scripts/vps-status.sh` — shows container health, nginx, SSL, disk
- **VPS logs**: `bash scripts/vps-logs.sh [backend|db|build|nginx]` — live logs
- **VPS rollback**: `bash scripts/vps-rollback.sh [commit-hash]` — rollback to previous commit
- **VPS**: 187.77.130.117 (Hostinger), running Docker containers: `ana-db` (PostgreSQL 16) + `ana-backend` (Node.js app)
- **Nginx**: Proxies `https://ana-ca.com` → `127.0.0.1:5002` (ana-backend), SSL via Let's Encrypt (auto-renews)
- **Auto Schema Sync**: `deploy/entrypoint.sh` runs `drizzle-kit push` before every app startup to keep DB in sync with schema
- **Admin credentials**: `admin@calfirm.com` / `Admin@123`
- **April 2026 Fix**: Added `deleted_at` to all 38 WP tables and missing `wp_session_status` enum values (`wp_listing`, `audit_chain`, `review`) on VPS. Also added `updated_at` to 19 WP/audit tables (`wp_uploaded_files`, `wp_trigger_defs`, `analytics_session`, `evidence_log`, `recon_engine`, `wp_gl_accounts`, etc.) that were missing this column. Root cause: production DB was created from an older schema snapshot. All 36 GET endpoints now return HTTP 200. Future deployments auto-sync via entrypoint.sh → drizzle-kit push.
- **April 2026 Fix #2**: Fixed `wp_variables` upsert route — INSERT was using non-existent columns (`variableSection`, `dataType`, `mandatoryFlag`) instead of the correct `category` column, causing "Failed to upsert variable" errors when users edited dropdowns/checkboxes on the Data Extraction stage. Also added real-time live field population with 1.5s polling during auto-fill/AI fill, visual highlights on updated fields, and fixed stale-closure + interval-leak bugs.
- **Deploy process**: Build locally (`pnpm run build` in both `artifacts/api-server` and `artifacts/hrm-system`), copy frontend dist to `artifacts/api-server/dist/public/`, tar the dist, SCP to VPS, `docker cp` + `docker restart ana-backend`.

## External Dependencies

- **Database:** PostgreSQL
- **Frontend Framework:** React
- **UI Component Library:** shadcn/ui
- **Styling:** Tailwind CSS
- **API Framework:** Express
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **API Codegen:** Orval
- **Charts:** Recharts
- **Form Management:** React Hook Form
- **Animations:** Framer Motion
- **Routing:** Wouter
- **Build Tool:** Vite, esbuild
- **Logging:** Pino
- **Encryption:** AES-256-CBC
- **AI Integrations:** OpenAI, Anthropic (Claude), Google (Gemini), DeepSeek, custom OpenAI-compatible APIs
- **PDF Parsing:** pdf-parse
- **Excel Parsing:** xlsx
- **File Uploads:** multer
- **PDF Generation:** pdfkit