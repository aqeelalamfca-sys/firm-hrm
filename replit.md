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