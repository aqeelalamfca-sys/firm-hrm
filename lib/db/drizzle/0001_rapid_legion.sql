CREATE TYPE "public"."regulatory_category" AS ENUM('FBR', 'SECP', 'PSX', 'SBP');--> statement-breakpoint
CREATE TYPE "public"."regulatory_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."wp_exception_status" AS ENUM('open', 'cleared', 'override_approved', 'deferred', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."wp_extraction_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wp_file_category" AS ENUM('financial_statements', 'trial_balance', 'general_ledger', 'bank_statement', 'sales_tax_return', 'tax_notice', 'schedule', 'annexure', 'other');--> statement-breakpoint
CREATE TYPE "public"."wp_file_format" AS ENUM('excel', 'pdf', 'image');--> statement-breakpoint
CREATE TYPE "public"."wp_head_status" AS ENUM('locked', 'ready', 'in_progress', 'validating', 'review', 'approved', 'exported', 'completed');--> statement-breakpoint
CREATE TYPE "public"."wp_session_status" AS ENUM('upload', 'extraction', 'data_sheet', 'arranged_data', 'variables', 'generation', 'export', 'completed');--> statement-breakpoint
CREATE TYPE "public"."wp_source_type" AS ENUM('native_text_pdf', 'ocr_pdf', 'image_ocr', 'excel_native', 'manual_entry');--> statement-breakpoint
CREATE TABLE "auto_gen_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "regulatory_category" NOT NULL,
	"generated_text" text,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"run_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "regulatory_category" NOT NULL,
	"text" text NOT NULL,
	"source" text DEFAULT 'manual',
	"priority" "regulatory_priority" DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "analytics_engine" (
	"id" serial PRIMARY KEY NOT NULL,
	"ratio_code" varchar(30) NOT NULL,
	"ratio_name" text NOT NULL,
	"formula" text NOT NULL,
	"numerator_field" text,
	"denominator_field" text,
	"threshold_min" numeric(10, 4),
	"threshold_max" numeric(10, 4),
	"threshold_description" text,
	"wp_trigger" varchar(20),
	"category" text,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "analytics_engine_ratio_code_unique" UNIQUE("ratio_code")
);
--> statement-breakpoint
CREATE TABLE "analytics_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"ratio_code" varchar(30) NOT NULL,
	"computed_value" numeric(15, 4),
	"prior_year_value" numeric(15, 4),
	"variance" numeric(15, 4),
	"breached" boolean DEFAULT false,
	"explanation" text,
	"wp_triggered" boolean DEFAULT false,
	"reviewed_by" text,
	"conclusion" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assertion_linkage" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_type" text NOT NULL,
	"fs_line_item" text,
	"assertion" text NOT NULL,
	"wp_code" varchar(20),
	"wp_link" text,
	"testing_procedure" text,
	"isa_reference" text,
	"risk_tag" text,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_engine_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"engagement_id" varchar(50),
	"client_name" text,
	"entity_type" text,
	"industry_type" text,
	"financial_year_start" text,
	"financial_year_end" text,
	"reporting_framework" text DEFAULT 'IFRS',
	"audit_type" text DEFAULT 'Statutory',
	"engagement_status" text DEFAULT 'Planning',
	"materiality_amount" numeric(18, 2),
	"performance_materiality" numeric(18, 2),
	"triviality_threshold" numeric(18, 2),
	"risk_level_overall" text DEFAULT 'Medium',
	"going_concern_flag" boolean DEFAULT false,
	"fraud_risk_flag" boolean DEFAULT false,
	"related_party_flag" boolean DEFAULT false,
	"laws_regulation_flag" boolean DEFAULT false,
	"component_audit_flag" boolean DEFAULT false,
	"group_audit_flag" boolean DEFAULT false,
	"it_system_type" text DEFAULT 'ERP',
	"internal_audit_flag" boolean DEFAULT false,
	"use_of_expert_flag" boolean DEFAULT false,
	"sampling_method" text DEFAULT 'MUS',
	"data_source" text DEFAULT 'OCR',
	"confidence_level" numeric(5, 2),
	"exception_flag" boolean DEFAULT false,
	"prepared_by" text,
	"reviewed_by" text,
	"approved_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "audit_engine_master_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "control_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"process_name" text NOT NULL,
	"control_description" text NOT NULL,
	"control_frequency" text,
	"control_owner" text,
	"test_type" text DEFAULT 'ToC',
	"sample_size" integer,
	"testing_result" text,
	"exception_count" integer DEFAULT 0,
	"related_wp_code" varchar(20),
	"isa_reference" text,
	"tested_by" text,
	"conclusion" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evidence_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"wp_code" varchar(20),
	"head_id" integer,
	"evidence_id" varchar(50),
	"document_type" text,
	"document_ref" text,
	"source" text DEFAULT 'Client',
	"description" text,
	"obtained_date" text,
	"verified_flag" boolean DEFAULT false,
	"verified_by" text,
	"reviewer_comment" text,
	"exception_flag" boolean DEFAULT false,
	"attachment_path" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recon_engine" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"check_name" text NOT NULL,
	"source_a" text NOT NULL,
	"source_b" text NOT NULL,
	"amount_a" numeric(18, 2),
	"amount_b" numeric(18, 2),
	"difference" numeric(18, 2),
	"passed" boolean DEFAULT false,
	"rule" text,
	"notes" text,
	"run_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sampling_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"risk_level" text NOT NULL,
	"materiality_band" text NOT NULL,
	"sample_size_min" integer NOT NULL,
	"sample_size_max" integer NOT NULL,
	"coverage_pct" numeric(5, 2),
	"sampling_method" text,
	"testing_approach" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_arranged_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"tab" text NOT NULL,
	"row_index" integer DEFAULT 0 NOT NULL,
	"source_file" text,
	"source_sheet_page" text,
	"field_name" text NOT NULL,
	"extracted_value" text,
	"confidence" numeric(5, 2),
	"override_value" text,
	"final_approved_value" text,
	"is_approved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_exception_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"head_index" integer,
	"exception_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"exception_log_status" "wp_exception_status" DEFAULT 'open' NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"exception_code" text,
	"exception_type" text NOT NULL,
	"severity" text DEFAULT 'Medium',
	"source_area" text,
	"reference_code" text,
	"description" text NOT NULL,
	"detail" text,
	"isa_reference" text,
	"resolved_flag" boolean DEFAULT false,
	"resolved_by" text,
	"resolved_at" timestamp,
	"resolution_note" text,
	"auto_flagged" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_export_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"head_id" integer,
	"export_type" text DEFAULT 'head' NOT NULL,
	"format" text,
	"file_name" text,
	"export_job_status" text DEFAULT 'pending',
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_extracted_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"extraction_run_id" integer,
	"category" text NOT NULL,
	"field_name" text NOT NULL,
	"extracted_value" text,
	"final_value" text,
	"confidence" numeric(5, 2),
	"source_file" text,
	"source_sheet" text,
	"source_page_no" integer,
	"is_overridden" boolean DEFAULT false,
	"is_approved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_extraction_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"file_id" integer,
	"extraction_status" "wp_extraction_status" DEFAULT 'pending' NOT NULL,
	"source_type" "wp_source_type",
	"total_pages" integer,
	"processed_pages" integer DEFAULT 0,
	"raw_text" text,
	"structured_data" jsonb,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_fs_extraction" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"extraction_id" text,
	"source_file_name" text,
	"source_file_type" text,
	"page_no" integer,
	"statement_type" text,
	"section_name" text,
	"line_item_text" text,
	"amount_current" numeric(15, 2),
	"amount_prior" numeric(15, 2),
	"currency" text DEFAULT 'PKR',
	"sign_convention" text,
	"extraction_method" text,
	"confidence_score" numeric(5, 2),
	"normalized_text" text,
	"exception_flag" boolean DEFAULT false,
	"exception_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_fs_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"mapping_id" text,
	"extraction_id" text,
	"statement_type" text,
	"fs_line_item" text,
	"fs_note_no" text,
	"current_amount" numeric(15, 2),
	"prior_amount" numeric(15, 2),
	"account_code" text,
	"account_name" text,
	"mapping_fs_line" text,
	"mapping_method" text,
	"mapping_confidence" numeric(5, 2),
	"reconciliation_flag" boolean DEFAULT false,
	"exception_flag" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_gl_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"account_code" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" text,
	"opening_balance" numeric(15, 2) DEFAULT '0',
	"closing_balance" numeric(15, 2) DEFAULT '0',
	"total_debit" numeric(15, 2) DEFAULT '0',
	"total_credit" numeric(15, 2) DEFAULT '0',
	"tb_debit" numeric(15, 2) DEFAULT '0',
	"tb_credit" numeric(15, 2) DEFAULT '0',
	"is_reconciled" boolean DEFAULT false,
	"is_synthetic" boolean DEFAULT false,
	"generation_rationale" text,
	"transaction_count_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_gl_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"gl_account_id" integer,
	"entry_date" text NOT NULL,
	"voucher_no" text,
	"narration" text,
	"debit" numeric(15, 2) DEFAULT '0',
	"credit" numeric(15, 2) DEFAULT '0',
	"running_balance" numeric(15, 2),
	"month" integer,
	"is_synthetic" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_head_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"head_id" integer NOT NULL,
	"paper_code" text NOT NULL,
	"paper_name" text NOT NULL,
	"content" text,
	"output_format" text DEFAULT 'word',
	"document_status" text DEFAULT 'pending',
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_heads" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"head_index" integer NOT NULL,
	"head_name" text NOT NULL,
	"head_status" "wp_head_status" DEFAULT 'locked' NOT NULL,
	"papers_included" jsonb,
	"output_type" text,
	"generated_at" timestamp,
	"validated_at" timestamp,
	"approved_at" timestamp,
	"approved_by" integer,
	"exported_at" timestamp,
	"exceptions_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_journal_import" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"journal_id" text,
	"entry_no" text,
	"entry_date" text,
	"period" text,
	"voucher_type" text,
	"document_no" text,
	"narration" text,
	"account_code" text,
	"account_name" text,
	"cost_center" text,
	"department" text,
	"project_code" text,
	"party_code" text,
	"debit_amount" numeric(15, 2) DEFAULT '0',
	"credit_amount" numeric(15, 2) DEFAULT '0',
	"currency" text DEFAULT 'PKR',
	"exchange_rate" numeric(10, 6) DEFAULT '1',
	"base_debit" numeric(15, 2) DEFAULT '0',
	"base_credit" numeric(15, 2) DEFAULT '0',
	"source_system" text,
	"source_file_name" text,
	"posted_flag" boolean DEFAULT true,
	"data_source" text,
	"confidence_score" numeric(5, 2),
	"exception_flag" boolean DEFAULT false,
	"exception_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_library_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"wp_code" varchar(20) NOT NULL,
	"wp_phase" text,
	"wp_title" text NOT NULL,
	"wp_category" text,
	"isa_reference" text,
	"secondary_reference" text,
	"code_family" varchar(4),
	"display_order" integer DEFAULT 0,
	"trigger_entity_type" text,
	"trigger_industry" text,
	"trigger_risk" text,
	"trigger_fs_head" text,
	"trigger_control_mode" text,
	"trigger_materiality" text,
	"mandatory_flag" boolean DEFAULT false,
	"output_format" text DEFAULT 'Word',
	"parent_wp_code" varchar(20),
	"linked_wp_codes" text,
	"linked_assertion" text,
	"linked_audit_procedure_type" text,
	"linked_evidence_type" text,
	"linked_report_area" text,
	"pakistan_law_tag" text,
	"reviewer_level" text,
	"auto_generate_flag" boolean DEFAULT false,
	"ai_input_source" text,
	"status" text DEFAULT 'Draft',
	"version_no" text DEFAULT 'v1.0',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "wp_library_master_wp_code_unique" UNIQUE("wp_code")
);
--> statement-breakpoint
CREATE TABLE "wp_library_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"wp_code" varchar(20) NOT NULL,
	"wp_title" text,
	"wp_phase" text,
	"wp_category" text,
	"isa_reference" text,
	"trigger_reason" text,
	"mandatory_flag" boolean DEFAULT false,
	"status" text DEFAULT 'Pending',
	"prepared_by" text,
	"reviewed_by" text,
	"approved_by" text,
	"prepared_date" text,
	"reviewed_date" text,
	"approved_date" text,
	"conclusion" text,
	"output_format" text,
	"reviewer_level" text,
	"evidence_count" integer DEFAULT 0,
	"auto_generate_flag" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_master_coa" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"account_code" varchar(20) NOT NULL,
	"parent_code" varchar(20),
	"account_name" text NOT NULL,
	"fs_head" text,
	"fs_sub_head" text,
	"account_type" text,
	"normal_balance" text,
	"industry_tag" text,
	"entity_type_tag" text,
	"ifrs_reference" text,
	"tax_treatment" text,
	"is_control_account" boolean DEFAULT false,
	"is_sub_ledger" boolean DEFAULT false,
	"opening_balance" numeric(15, 2) DEFAULT '0',
	"debit_total" numeric(15, 2) DEFAULT '0',
	"credit_total" numeric(15, 2) DEFAULT '0',
	"closing_balance" numeric(15, 2) DEFAULT '0',
	"prior_year_balance" numeric(15, 2),
	"variance" numeric(15, 2),
	"materiality_tag" text,
	"risk_tag" text,
	"assertion_tag" text,
	"related_party_flag" boolean DEFAULT false,
	"cash_flow_tag" text,
	"mapping_gl_code" text,
	"mapping_fs_line" text,
	"working_paper_code" text,
	"reconciliation_flag" boolean DEFAULT false,
	"data_source" text,
	"confidence_score" numeric(5, 2),
	"exception_flag" boolean DEFAULT false,
	"notes" text,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_output_job" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'queued',
	"triggered_by" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"output_path" text,
	"output_size" integer,
	"record_count" integer,
	"error_message" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_session_lock" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"locked_at" timestamp DEFAULT now(),
	"locked_by" text NOT NULL,
	"lock_level" text DEFAULT 'Partner',
	"lock_justification" text,
	"pre_archive_validation_passed" boolean DEFAULT false,
	"archive_ref" text,
	"retention_end_date" text,
	"eqcr_completed" boolean DEFAULT false,
	"eqcr_by" text,
	"unlock_allowed" boolean DEFAULT false,
	"unlocked_at" timestamp,
	"unlocked_by" text,
	"unlock_reason" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wp_session_lock_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "wp_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"client_name" text NOT NULL,
	"engagement_year" text NOT NULL,
	"entity_type" text,
	"ntn" text,
	"strn" text,
	"period_start" text,
	"period_end" text,
	"reporting_framework" text DEFAULT 'IFRS',
	"engagement_type" text DEFAULT 'statutory_audit',
	"engagement_continuity" text DEFAULT 'first_time',
	"audit_firm_name" text,
	"audit_firm_logo" text,
	"preparer_id" integer,
	"preparer_name" text,
	"reviewer_id" integer,
	"reviewer_name" text,
	"approver_id" integer,
	"approver_name" text,
	"status" "wp_session_status" DEFAULT 'upload' NOT NULL,
	"current_head_index" integer DEFAULT 0,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_trial_balance_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"account_code" text NOT NULL,
	"account_name" text NOT NULL,
	"classification" text,
	"fs_line_mapping" text,
	"debit" numeric(15, 2) DEFAULT '0',
	"credit" numeric(15, 2) DEFAULT '0',
	"balance" numeric(15, 2) DEFAULT '0',
	"prior_year_balance" numeric(15, 2),
	"source" text DEFAULT 'deterministic',
	"confidence" numeric(5, 2),
	"is_approved" boolean DEFAULT false,
	"has_exception" boolean DEFAULT false,
	"exception_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_trigger_defs" (
	"id" serial PRIMARY KEY NOT NULL,
	"wp_code" varchar(20) NOT NULL,
	"wp_name" text NOT NULL,
	"trigger_condition" text NOT NULL,
	"trigger_description" text,
	"isa_reference" text,
	"output_format" text DEFAULT 'Word',
	"mandatory_flag" boolean DEFAULT true,
	"category" text,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wp_trigger_defs_wp_code_unique" UNIQUE("wp_code")
);
--> statement-breakpoint
CREATE TABLE "wp_trigger_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_name" text NOT NULL,
	"rule_description" text,
	"code_family" varchar(4),
	"entity_type" text,
	"industry" text,
	"risk" text,
	"fs_head" text,
	"control_mode" text,
	"materiality_level" text,
	"activate_wp_codes" text NOT NULL,
	"procedure_type" text,
	"assertion_link" text,
	"sampling_rate" numeric(5, 2),
	"priority" integer DEFAULT 50,
	"mandatory_override" boolean DEFAULT false,
	"isa_justification" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_trigger_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"wp_code" varchar(20) NOT NULL,
	"triggered" boolean DEFAULT false,
	"trigger_reason" text,
	"status" text DEFAULT 'pending',
	"prepared_by" text,
	"reviewed_by" text,
	"completed_at" timestamp,
	"conclusion" text,
	"exception_note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_uploaded_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"category" "wp_file_category" NOT NULL,
	"format" "wp_file_format" NOT NULL,
	"source_type" "wp_source_type",
	"page_count" integer,
	"sheet_count" integer,
	"is_valid" boolean DEFAULT true,
	"validation_errors" text,
	"file_data" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_validation_result" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"run_at" timestamp DEFAULT now(),
	"overall_pass" boolean DEFAULT false,
	"tb_fs_pass" boolean DEFAULT false,
	"tb_fs_difference" numeric(15, 2),
	"tb_fs_note" text,
	"gl_tb_pass" boolean DEFAULT false,
	"gl_tb_note" text,
	"mandatory_vars_pass" boolean DEFAULT false,
	"missing_vars" text,
	"confidence_pass" boolean DEFAULT false,
	"low_confidence_count" integer DEFAULT 0,
	"low_confidence_items" text,
	"mandatory_wps_pass" boolean DEFAULT false,
	"incomplete_wp_count" integer DEFAULT 0,
	"coa_tb_pass" boolean DEFAULT false,
	"unmapped_account_count" integer DEFAULT 0,
	"blocked_reasons" text,
	"warnings" text,
	"generation_allowed" boolean DEFAULT false,
	"validated_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "wp_variable_change_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"variable_id" integer,
	"variable_code" varchar(100),
	"field_name" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"edited_by" integer,
	"reason" text,
	"source_of_change" text DEFAULT 'manual',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_variable_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"variable_code" varchar(100) NOT NULL,
	"variable_group" text NOT NULL,
	"variable_subgroup" text,
	"variable_name" text NOT NULL,
	"variable_label" text NOT NULL,
	"description" text,
	"data_type" text DEFAULT 'text' NOT NULL,
	"input_mode" text DEFAULT 'text',
	"dropdown_options_json" jsonb,
	"default_value" text,
	"mandatory_flag" boolean DEFAULT false,
	"editable_flag" boolean DEFAULT true,
	"ai_extractable_flag" boolean DEFAULT false,
	"review_required_flag" boolean DEFAULT false,
	"standard_reference" text,
	"pakistan_reference" text,
	"affects_modules_json" jsonb,
	"affects_working_papers_json" jsonb,
	"display_order" integer DEFAULT 0,
	"active_flag" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wp_variable_definitions_variable_code_unique" UNIQUE("variable_code")
);
--> statement-breakpoint
CREATE TABLE "wp_variable_dependency_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger_variable_code" varchar(100) NOT NULL,
	"condition_expression" text,
	"impacted_variable_codes_json" jsonb,
	"impacted_working_papers_json" jsonb,
	"impacted_calculations_json" jsonb,
	"impacted_risk_areas_json" jsonb,
	"active_flag" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wp_variables" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"variable_code" varchar(100) NOT NULL,
	"category" text NOT NULL,
	"variable_name" text NOT NULL,
	"auto_filled_value" text,
	"user_edited_value" text,
	"final_value" text,
	"raw_extracted_value" text,
	"normalized_value" text,
	"confidence" numeric(5, 2),
	"source_type" text,
	"source_file_id" integer,
	"source_sheet" text,
	"source_page" integer,
	"review_status" text DEFAULT 'pending',
	"is_locked" boolean DEFAULT false,
	"locked_at" timestamp,
	"locked_by" integer,
	"edited_by" integer,
	"edited_at" timestamp,
	"reason_for_change" text,
	"version_no" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "icap_registration_status" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "articles_ending_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "articles_extension_period" text;--> statement-breakpoint
ALTER TABLE "regulatory_updates" ADD CONSTRAINT "regulatory_updates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_updates" ADD CONSTRAINT "regulatory_updates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_session" ADD CONSTRAINT "analytics_session_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_engine_master" ADD CONSTRAINT "audit_engine_master_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_matrix" ADD CONSTRAINT "control_matrix_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_log" ADD CONSTRAINT "evidence_log_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_log" ADD CONSTRAINT "evidence_log_head_id_wp_heads_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."wp_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_engine" ADD CONSTRAINT "recon_engine_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_arranged_data" ADD CONSTRAINT "wp_arranged_data_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_exception_log" ADD CONSTRAINT "wp_exception_log_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_exceptions" ADD CONSTRAINT "wp_exceptions_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_export_jobs" ADD CONSTRAINT "wp_export_jobs_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_export_jobs" ADD CONSTRAINT "wp_export_jobs_head_id_wp_heads_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."wp_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_extracted_fields" ADD CONSTRAINT "wp_extracted_fields_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_extracted_fields" ADD CONSTRAINT "wp_extracted_fields_extraction_run_id_wp_extraction_runs_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."wp_extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_extraction_runs" ADD CONSTRAINT "wp_extraction_runs_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_extraction_runs" ADD CONSTRAINT "wp_extraction_runs_file_id_wp_uploaded_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."wp_uploaded_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_fs_extraction" ADD CONSTRAINT "wp_fs_extraction_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_fs_mapping" ADD CONSTRAINT "wp_fs_mapping_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_gl_accounts" ADD CONSTRAINT "wp_gl_accounts_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_gl_entries" ADD CONSTRAINT "wp_gl_entries_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_gl_entries" ADD CONSTRAINT "wp_gl_entries_gl_account_id_wp_gl_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."wp_gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_head_documents" ADD CONSTRAINT "wp_head_documents_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_head_documents" ADD CONSTRAINT "wp_head_documents_head_id_wp_heads_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."wp_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_heads" ADD CONSTRAINT "wp_heads_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_journal_import" ADD CONSTRAINT "wp_journal_import_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_library_session" ADD CONSTRAINT "wp_library_session_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_master_coa" ADD CONSTRAINT "wp_master_coa_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_output_job" ADD CONSTRAINT "wp_output_job_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_session_lock" ADD CONSTRAINT "wp_session_lock_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_sessions" ADD CONSTRAINT "wp_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_trial_balance_lines" ADD CONSTRAINT "wp_trial_balance_lines_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_trigger_session" ADD CONSTRAINT "wp_trigger_session_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_uploaded_files" ADD CONSTRAINT "wp_uploaded_files_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_validation_result" ADD CONSTRAINT "wp_validation_result_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_variable_change_log" ADD CONSTRAINT "wp_variable_change_log_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_variable_change_log" ADD CONSTRAINT "wp_variable_change_log_variable_id_wp_variables_id_fk" FOREIGN KEY ("variable_id") REFERENCES "public"."wp_variables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_variables" ADD CONSTRAINT "wp_variables_session_id_wp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."wp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_gen_logs_run_at_idx" ON "auto_gen_logs" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "auto_gen_logs_status_idx" ON "auto_gen_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "regulatory_updates_category_idx" ON "regulatory_updates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "regulatory_updates_is_active_idx" ON "regulatory_updates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "regulatory_updates_created_at_idx" ON "regulatory_updates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "regulatory_updates_priority_idx" ON "regulatory_updates" USING btree ("priority");