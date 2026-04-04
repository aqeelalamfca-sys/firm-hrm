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
- **Multi-Provider AI Integration**: Supports OpenAI, Anthropic (Claude), Google (Gemini), DeepSeek, and custom OpenAI-compatible APIs. All providers use the OpenAI SDK with custom base URLs. Provider/model/URL configured via `system_settings` table keys: `ai_provider`, `ai_model`, `ai_base_url`, `chatgpt_api_key`. Environment variables `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` take priority when set. SSRF protection via `isValidBaseUrl()` in `system-settings.ts`.
- Security enhancements include Helmet security headers, AES-256-CBC encryption for sensitive client credentials, rate limiting, and structured logging with Pino.
- Performance is optimized through N+1 query elimination strategies (e.g., batched queries, SQL-level filtering), extensive database indexing, and frontend memoization.

**Admin Credentials (seeded):** `admin@calfirm.com` / `Admin@123` (role: `super_admin`). Password hashed as `SHA256(password + "hrm_salt_2024")`. DB column is `password_hash`; role enum values: `super_admin`, `hr_admin`, `finance_officer`, `manager`, `employee`, `partner`, `trainee`.

**AI Working Paper Generator (Audit-Grade Sequential Workflow) — V2 REBUILT:**
- Frontend: `artifacts/hrm-system/src/pages/working-papers.tsx`
- Backend: `artifacts/api-server/src/routes/working-papers.ts`
- Schema: `lib/db/src/schema/working_papers.ts` (16 tables incl. wp_variable_definitions, wp_variable_dependency_rules)
- Variable definitions: `artifacts/api-server/src/data/variable-definitions.ts` (413+ variables incl. 96 CY/PY generated, 20 groups, all with explicit dataType + inputMode + dropdownOptionsJson). Auto-fill covers 100% of variables with tiered confidence: session-derived=90%, smart defaults=60%, zero-numerics=50%, empty placeholders=30%. No variable is ever "missing" by default.
- **Session creation form**: Entity type dropdown (11 Pakistani entity types: Private Ltd, Public Listed/PIE, Public Unlisted, Single Member, LLP, AOP, Sole Proprietor, NGO/NPO, Trust, Govt Entity, Branch Office), NTN, STRN, reporting framework (IFRS/IFRS for SMEs/AFRS/Fourth Schedule/Fifth Schedule), engagement type (statutory audit, limited review, agreed-upon procedures, compilation, special purpose, group audit, IPO/due diligence). Session metadata auto-populates variables during auto-fill.
- **6-stage flow**: Upload → AI Extraction → Arranged Data Review → Variables (Lock) → Head-wise Generation → Export
- **Session-based**: All data persisted in PostgreSQL (wp_sessions, wp_uploaded_files, wp_extraction_runs, wp_extracted_fields, wp_arranged_data, wp_variables, wp_variable_change_log, wp_exception_log, wp_trial_balance_lines, wp_gl_accounts, wp_gl_entries, wp_heads, wp_head_documents, wp_export_jobs, wp_variable_definitions, wp_variable_dependency_rules)
- **Strict upload rules**: Financial Statements/TB/GL/Bank → Excel only; Sales Tax/Notices/Annexures → PDF only
- **OCR detection**: Scanned PDFs auto-detected (text < 100 chars with large buffer), source type classified as native_text_pdf/ocr_pdf/image_ocr/excel_native
- **Arranged data staging**: 10 tabs (Entity Profile, Reporting Metadata, FS Line Items, Prior Year Comparatives, Sales Tax Data, Tax Period Summary, Notes/Schedules, Exceptions, Assumptions Register, Extraction Log) with field-level confidence scoring
- **Audit Variable Engine (370+ variables across 20 groups)**: Entity & Constitution, Ownership & Governance, Engagement Acceptance, Accounting & Records, TB & COA, Financial Statements (CY+PY), Materiality, Risk Assessment, Internal Controls, Sampling, Analytical Procedures, Tax & Compliance, Related Parties, Laws & Regulations, Audit Evidence, Going Concern, Misstatements, Completion & Reporting, QC & Inspection, Workflow & Sign-offs
- **Variable management**: Master definitions with dataType, inputMode (text/dropdown/toggle/date), mandatory flag, AI-extractable flag, review-required flag, ISA standard references, Pakistan law references, and working paper impact linkage. Auto-filled from extraction via EXTRACTION_FIELD_TO_VARIABLE_MAP, editable with mandatory reason-for-change, confidence scoring, review status workflow (pending → auto_filled → needs_review → reviewed → confirmed), section-wise and all-at-once locking with mandatory validation gate
- **100% Auto-Population Engine**: Zero blank variables — every variable receives a value from one of 5 source tiers: (1) AI extraction (confidence=75-95%), (2) Session metadata (90%), (3) Formula/cross-field calculation (85%), (4) Standard defaults (60%), (5) Intelligent assumptions (45%, flagged for review). Cross-field materiality: auto-calculates basis_amount → overall_materiality → performance_materiality → trivial_threshold from extracted financials. Analytics: auto-derives revenue/asset variance narrative from CY/PY data. Sampling: auto-estimates population_value, key_item_value, sample_size from revenue. Source types: ai_extraction, session, formula, default, assumption. Exception engine: `needs_confirmation` for mandatory assumptions, `low_confidence` for <50% confidence. All 26 previously-empty variables now have contextual defaults (officer names reference Form 29, addresses reference SECP Form A, risk summaries cite ISA standards).
- **Validation rules engine**: Mandatory checks, conditional logic (listed/PIE → EQCR, sales_tax_applicable → ST variables, related_parties → RP register, controls_reliance → ToC, modified opinion → basis), materiality auto-calculation suggestions
- **Variable dependency rules**: Trigger-based impact detection — when a variable changes after heads are approved, exceptions are auto-generated marking affected heads as needing regeneration
- **Variable UI**: Collapsible groups with completion %, summary cards (total/filled/missing/low-confidence/needs-review/locked), search bar, filter pills (all/mandatory/missing/low-confidence/needs-review/reviewed/locked), audit trail viewer
- **Comprehensive Input Renderer (40+ inputModes)**: `RenderEditInput` + `RenderDisplayValue` handle all field types: `text`, `number`, `date`, `time`, `datetime`, `date_range`, `email`, `phone`, `url`, `masked/password`, `dropdown`, `multi_select`, `radio`, `checkbox`, `checkbox_group`, `toggle`, `yes_no_na`, `pass_fail`, `risk_level`, `rating_level`, `exception_flag`, `conclusion`, `status`, `textarea`, `comment`, `tag_input`, `manual_override`, `currency`, `percentage`, plus display-only: `formula`, `readonly`, `locked`, `autofill`, `ai_extracted`, `ai_narrative`, `ai_suggestion`, `ai_confidence`, `ai_reconciliation`, `progress_bar`, `validation_message`, `info_banner`, `error_alert`, `summary_card`, `label`. Utilities: `pillColor()` maps 40+ domain values to color classes, `statusColor()` maps workflow states, `safeParseArray()` guards JSON array parsing, `safeFormatDate()` guards date formatting. Helper components: `PillSelector`, `MultiSelectInput`, `TagInput`.
- **Confidence scoring**: Field-level 0-100%, color-coded (90-100% green, 70-89% amber/review, <70% red/confirm required)
- **TB & GL Engine (Production-Grade, Steps 1-11)**: Full refactor into dedicated `artifacts/api-server/src/routes/tb-gl-engine.ts` module. Unified `POST /generate-tb-gl` endpoint added with 5-stage pipeline (Input Extraction → CoA Mapping → Trial Balance → General Ledger → Reconciliation). Individual `/generate-tb` and `/generate-gl` endpoints enhanced to delegate to the engine.
  - **Step 1-2 (Input & CoA Mapping)**: 30-entry Pakistan COA (4-digit, Companies Act/IFRS), auto-mapped from FS line items via `mapFsToCoa()`. Fuzzy mapping for unlisted keys with keyword-based classification. 3-layer fallback: extracted TB → FS deterministic → AI-generated.
  - **Step 3 (TB Generation)**: Proper Dr/Cr sign enforcement (Assets/Expenses=Dr; Liabilities/Equity/Revenue=Cr). `intelligentBalance()` replaces blind plug: <0.5% diff → Suspense Rounding (9001), ≥0.5% → Suspense Unreconciled (9002) with audit flag.
  - **Steps 4-6 (GL Engine)**: Materiality-aware transaction counts (`txCountForAccount()`): high-value accounts fewer/larger; low-value more/granular. Opening balances: P&L=0, B/S=derived ratio. `forceGlBalance()` ensures Opening + Σentries = Closing exactly (adjusts last entry). All entries use Pakistan-context narrations.
  - **Step 7 (3-Way Reconciliation)**: FS↔TB category totals, TB↔GL per-account closing balances. Auto-corrects GL via adjusting entries; logs variance report as exception.
  - **Step 11 (Enforcement)**: `checkFinalEnforcement()` blocks finalization unless TB balanced and all GL accounts reconciled.
  - **UI**: Single "Generate TB & GL" button (primary, above heads list) with animated 5-stage progress tracker. Per-stage icons (ok/warn/fail/pending). Summary card shows TB accounts, balance status, GL accounts, GL entries. Re-generate button after completion.
- **GL engine (individual)**: AI generates per-account with controls: opening balance, monthly spread, voucher continuity, closing force-corrected to match TB exactly. Batch processing (5 accounts/batch). All synthetic entries flagged
- **12 audit heads (sequential)**: Trial Balance → General Ledger → Pre-Planning → TB&GL → Client Documents → OB Verification → Planning → Execution → Finalization → Deliverables → EQCR → Inspection. Each: generate → validate → approve → export → unlock next
- **Dependency gates**: Each head requires all prerequisite heads approved, extraction done, variables locked
- **Exception center**: Types include extraction_flag, tb_imbalance, gl_issue, generation_issue with severity levels and status workflow (open/cleared/override_approved/deferred/not_applicable)
- **Export**: TB→Excel, GL→Excel (per-account sheets), Pre-Planning→Word, mixed heads→Word+Excel. Full bundle export with index sheet, TB, exceptions log, and audit trail
- **AI prompts**: extract (8000 tokens, 0.1 temp, Pakistan-focused forensic extraction), GL (6000 tokens/batch, 0.3 temp), WP generation (4000 tokens/paper, 0.3 temp, ISA-compliant)
- Docker: `deploy/Dockerfile` uses `--no-frozen-lockfile` (patched for pnpm lockfile drift)

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

**Working Papers Wizard:**
- Route: `/working-papers` (auth-protected, staff only)
- Source: `artifacts/hrm-system/src/pages/working-papers.tsx` (~3450 lines)
- Backend: `artifacts/api-server/src/routes/working-papers.ts` (~2283 lines)
- **3-section wizard** (STEPS array, ids 0–2):
  1. **Upload** (step 0) — DropZone file upload · WP category selection (A–K phases via `selectedPhases` state, syncs to `selectedPapers` via useEffect) · Special context/instructions textarea · "Extract & Configure →" button (calls `handleExtractAndNext` → AI OCR extraction → setStep(1))
  2. **Configure** (step 1) — Entity & firm details · Engagement team · Key deadlines · Financial Statements (BS/PL with manual + Excel upload) · Sales Tax data · Engagement variable template (121 variables in groups A–K) with profile defaults · "Continue to Output →" (setStep(2))
  3. **Output** (step 2) — Four sub-sections on one page:
     - **AI Analysis**: Run analysis button → materiality, risk, FS assertions, IC weaknesses; stale-data warning if config changed
     - **GL & TB Generation**: `handleGenerateGlTb` → AI-generated GL entries + TB accounts; expandable GL/TB data tables
     - **Working Papers**: idle/generating/generated view; phase-by-phase progress (A–K); evidence index; paper cards with expand/collapse and download per paper
     - **Export & Finalize**: Excel (.xlsx), Word (.docx), PDF, and Confirmations Bundle download cards
- **Draft key**: `DRAFT_KEY = "ana_wp_draft_v2"` — autosaved to localStorage (1.5s debounce)
- **AI model**: `gpt-4o` via Replit proxy (`getAIClient()`)
- pdfkit is in `external` array of `artifacts/api-server/build.mjs` (prevents Helvetica.afm crash)

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