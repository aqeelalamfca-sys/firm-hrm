CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'hr_admin', 'finance_officer', 'manager', 'employee', 'partner', 'trainee');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive', 'on_leave', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'half_day', 'leave');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('annual', 'sick', 'casual', 'maternity', 'paternity', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'approved', 'issued', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('audit', 'tax', 'advisory', 'accounting', 'other');--> statement-breakpoint
CREATE TYPE "public"."activity_action" AS ENUM('create', 'update', 'delete', 'login', 'logout', 'approve', 'reject', 'status_change', 'view', 'download', 'upload');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('planning', 'execution', 'review', 'completed', 'on_hold', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('audit', 'tax', 'advisory', 'accounting', 'compliance', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('trial_balance', 'general_ledger', 'bank_statement', 'tax_return', 'audit_report', 'engagement_letter', 'financial_statement', 'correspondence', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_log_action" AS ENUM('created', 'updated', 'status_changed', 'reassigned', 'completed');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'delayed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('task_assigned', 'task_due', 'task_overdue', 'task_status_changed', 'invoice_created', 'invoice_status_changed', 'leave_approved', 'leave_rejected', 'system');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'shortlisted', 'rejected', 'selected');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('pending', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name"),
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"employee_id" integer,
	"department_id" integer,
	"phone" text,
	"mobile" text,
	"cnic" text,
	"profile_picture" text,
	"user_status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"department" text NOT NULL,
	"designation" text NOT NULL,
	"joining_date" date NOT NULL,
	"salary" numeric(12, 2) NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"reporting_manager_id" integer,
	"cnic" text,
	"address" text,
	"training_period" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"check_in" text,
	"check_out" text,
	"status" "attendance_status" NOT NULL,
	"hours_worked" numeric(5, 2),
	"notes" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"approved_by_id" integer,
	"approval_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"month" text NOT NULL,
	"year" integer NOT NULL,
	"basic_salary" numeric(12, 2) NOT NULL,
	"allowances" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"advances" numeric(12, 2) DEFAULT '0' NOT NULL,
	"overtime_hours" numeric(5, 2) DEFAULT '0' NOT NULL,
	"overtime_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_salary" numeric(12, 2) NOT NULL,
	"working_days" integer NOT NULL,
	"present_days" integer NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paid_date" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_code" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"industry" text,
	"ntn" text,
	"registration_no" text,
	"department_id" integer,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_client_code_unique" UNIQUE("client_code")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"client_id" integer NOT NULL,
	"engagement_id" integer,
	"department_id" integer,
	"service_type" "service_type" NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"wht_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_date" text,
	"is_recurring" boolean DEFAULT false,
	"recurring_frequency" "recurring_frequency",
	"next_generation_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"action" "activity_action" NOT NULL,
	"module" text NOT NULL,
	"entity_id" integer,
	"entity_type" text,
	"description" text NOT NULL,
	"old_values" text,
	"new_values" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"portal_name" text NOT NULL,
	"login_id" text NOT NULL,
	"encrypted_password" text NOT NULL,
	"portal_url" text,
	"notes" text,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"role" text NOT NULL,
	"hours_allocated" integer,
	"hours_worked" integer DEFAULT 0,
	"notes" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_code" text NOT NULL,
	"client_id" integer NOT NULL,
	"department_id" integer,
	"title" text NOT NULL,
	"type" "engagement_type" NOT NULL,
	"engagement_status" "engagement_status" DEFAULT 'planning' NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"partner_id" integer,
	"manager_id" integer,
	"budget" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "engagements_engagement_code_unique" UNIQUE("engagement_code")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"category" "document_category" DEFAULT 'other' NOT NULL,
	"department_id" integer,
	"client_id" integer,
	"engagement_id" integer,
	"task_id" integer,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_document_id" integer,
	"uploaded_by_id" integer NOT NULL,
	"file_path" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"action" "task_log_action" NOT NULL,
	"performed_by" integer,
	"details" text,
	"old_values" text,
	"new_values" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client_id" integer,
	"engagement_id" integer,
	"department_id" integer,
	"assigned_to" integer,
	"assigned_by" integer,
	"role_level" text,
	"start_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_entity_type" text,
	"related_entity_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcq_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"option_a" text NOT NULL,
	"option_b" text NOT NULL,
	"option_c" text NOT NULL,
	"option_d" text NOT NULL,
	"correct" text NOT NULL,
	"category" text NOT NULL,
	"difficulty" text DEFAULT 'easy' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"crn" text,
	"full_name" text NOT NULL,
	"father_name" text NOT NULL,
	"cnic" text NOT NULL,
	"date_of_birth" timestamp NOT NULL,
	"gender" text NOT NULL,
	"marital_status" text NOT NULL,
	"mobile" text NOT NULL,
	"alternate_mobile" text,
	"email" text NOT NULL,
	"current_address" text NOT NULL,
	"permanent_address" text NOT NULL,
	"cnic_front_url" text NOT NULL,
	"cnic_back_url" text NOT NULL,
	"photo_url" text NOT NULL,
	"matric_board" text NOT NULL,
	"matric_year" integer NOT NULL,
	"matric_marks" text NOT NULL,
	"inter_board" text NOT NULL,
	"inter_year" integer NOT NULL,
	"inter_marks" text NOT NULL,
	"graduation_degree" text,
	"graduation_uni" text,
	"graduation_year" integer,
	"graduation_marks" text,
	"icap_reg_no" text,
	"icap_level" text NOT NULL,
	"preferred_location" text NOT NULL,
	"preferred_dept" text NOT NULL,
	"available_start" timestamp NOT NULL,
	"is_full_time" boolean DEFAULT true NOT NULL,
	"current_engagement" text,
	"accounting_level" text NOT NULL,
	"excel_level" text NOT NULL,
	"software_skills" text,
	"communication" text NOT NULL,
	"experience_details" text,
	"declaration" boolean DEFAULT false NOT NULL,
	"test_score" integer,
	"test_total" integer DEFAULT 10,
	"test_status" text,
	"test_date" timestamp,
	"test_answers" text,
	"interview_date" timestamp,
	"pdf_url" text,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "training_applications_crn_unique" UNIQUE("crn"),
	CONSTRAINT "training_applications_cnic_unique" UNIQUE("cnic")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text NOT NULL,
	"client_phone" text NOT NULL,
	"company_name" text,
	"partner_name" text NOT NULL,
	"meeting_date" text NOT NULL,
	"meeting_time" text NOT NULL,
	"duration" text DEFAULT '30' NOT NULL,
	"purpose" text NOT NULL,
	"notes" text,
	"status" "meeting_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_employee_id_idx" ON "attendance" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "attendance_employee_date_idx" ON "attendance" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "leaves_employee_id_idx" ON "leaves" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leaves_status_idx" ON "leaves" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leaves_employee_status_idx" ON "leaves" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "payroll_employee_id_idx" ON "payroll" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_year_month_idx" ON "payroll" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "payroll_employee_year_idx" ON "payroll" USING btree ("employee_id","year");--> statement-breakpoint
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_module_idx" ON "activity_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_is_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");