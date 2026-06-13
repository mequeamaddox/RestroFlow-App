CREATE TYPE "public"."budget_category" AS ENUM('food', 'beverage', 'labor', 'utilities', 'marketing', 'maintenance', 'supplies', 'other');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."document_form_field_type" AS ENUM('text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio', 'signature');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('required', 'uploaded', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."document_status_new" AS ENUM('not_sent', 'sent', 'viewed', 'completed', 'signed', 'expired', 'declined');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('identification', 'tax-forms', 'emergency-contact', 'bank-info', 'employment-agreement', 'handbook', 'training-certificate', 'performance-review', 'disciplinary-action', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_type_new" AS ENUM('w4_federal', 'w4_state_sc', 'i9', 'handbook', 'policy', 'nda', 'emergency_contact', 'direct_deposit', 'benefits', 'safety_training', 'code_of_conduct', 'uniform_policy', 'harassment_policy', 'other');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('not-started', 'in-progress', 'completed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('restaurant_info', 'departments', 'positions', 'hr_addon', 'employee_invitations');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step_status" AS ENUM('pending', 'in-progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."owner_onboarding_status" AS ENUM('not_started', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."paycheck_layout" AS ENUM('no_printing', 'check_stub_only', 'check_on_top', 'check_on_bottom');--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'paused' BEFORE 'past_due';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'production_usage';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'recipe_consumption';--> statement-breakpoint
CREATE TABLE "auto_order_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_name" varchar(200) NOT NULL,
	"item_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"trigger_type" varchar(50) NOT NULL,
	"reorder_point" integer DEFAULT 50,
	"order_quantity" integer DEFAULT 100,
	"frequency" varchar(20) DEFAULT 'weekly',
	"enabled" boolean DEFAULT true,
	"last_triggered" timestamp,
	"estimated_savings" numeric(10, 2) DEFAULT '0',
	"user_id" varchar NOT NULL,
	"location_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_form_fields" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"field_label" varchar(255) NOT NULL,
	"field_type" "document_form_field_type" NOT NULL,
	"is_required" boolean DEFAULT false,
	"placeholder" varchar(255),
	"help_text" text,
	"options" jsonb,
	"validation" jsonb,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid,
	"position_id" uuid,
	"document_type" "document_type" NOT NULL,
	"is_required" boolean DEFAULT true,
	"description" text,
	"due_days_after_hire" integer DEFAULT 7,
	"renewal_period_days" integer,
	"reminder_days_before" integer DEFAULT 7,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "document_type_new" NOT NULL,
	"description" text,
	"file_path" varchar(500),
	"is_required" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"requires_signature" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"payroll_deduction_id" uuid NOT NULL,
	"custom_amount" numeric(10, 4),
	"is_active" boolean DEFAULT true,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_document_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"status" "document_status_new" DEFAULT 'not_sent',
	"completed_file_path" varchar(500),
	"signature_path" varchar(500),
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"completed_at" timestamp,
	"signed_at" timestamp,
	"expires_at" timestamp,
	"sent_by" uuid,
	"notes" text,
	"reminder_sent" timestamp,
	"reminder_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_document_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" varchar NOT NULL,
	"field_id" varchar NOT NULL,
	"field_value" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"document_name" varchar(200) NOT NULL,
	"file_path" varchar(500),
	"file_size" integer,
	"mime_type" varchar(100),
	"status" "document_status" DEFAULT 'required',
	"is_required" boolean DEFAULT false,
	"expiration_date" timestamp,
	"uploaded_by" varchar,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"version" integer DEFAULT 1,
	"replaced_document_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"status" "onboarding_status" DEFAULT 'not-started',
	"start_date" timestamp,
	"target_completion_date" timestamp,
	"actual_completion_date" timestamp,
	"completed_steps" integer DEFAULT 0,
	"total_steps" integer NOT NULL,
	"progress_percentage" numeric(5, 2) DEFAULT '0',
	"assigned_mentor_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_onboarding_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"token_id" uuid,
	"phone" varchar(20),
	"address" text,
	"city" varchar(100),
	"state" varchar(50),
	"zip_code" varchar(10),
	"date_of_birth" date,
	"social_security_number" varchar(11),
	"emergency_contact_name" varchar(100),
	"emergency_contact_phone" varchar(20),
	"emergency_contact_relationship" varchar(50),
	"bank_name" varchar(100),
	"account_number" varchar(50),
	"routing_number" varchar(20),
	"account_type" varchar(20),
	"completed_at" timestamp DEFAULT now(),
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_onboarding_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"status" "onboarding_step_status" DEFAULT 'pending',
	"started_date" timestamp,
	"completed_date" timestamp,
	"completed_by" varchar,
	"time_spent_hours" numeric(4, 2),
	"notes" text,
	"rating" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_assignment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"signature_data" text,
	"signature_type" varchar(50) DEFAULT 'digital',
	"signed_name" varchar(255),
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp DEFAULT now(),
	"document_hash" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"valuation_date" date NOT NULL,
	"fifo_value" numeric(12, 2),
	"lifo_value" numeric(12, 2),
	"weighted_avg_value" numeric(12, 2),
	"current_quantity" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invitation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(50),
	"last_name" varchar(50),
	"role" varchar(50) NOT NULL,
	"location_id" uuid NOT NULL,
	"department_id" uuid,
	"position_id" uuid,
	"hourly_rate" numeric(10, 2),
	"salary" numeric(12, 2),
	"start_date" date,
	"invited_by" varchar NOT NULL,
	"status" "invitation_status" DEFAULT 'pending',
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"employee_id" uuid,
	"personal_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "invitation_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(50),
	"required_documents" jsonb,
	"assigned_to_role" varchar(50),
	"estimated_duration_hours" numeric(4, 2) DEFAULT '1',
	"is_required" boolean DEFAULT true,
	"depends_on_step_ids" jsonb,
	"instructions" text,
	"resource_links" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(50),
	"location_id" uuid,
	"position_id" uuid,
	"is_default" boolean DEFAULT false,
	"estimated_duration_days" integer DEFAULT 7,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	CONSTRAINT "onboarding_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "owner_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"is_completed" boolean DEFAULT false,
	"current_step" "onboarding_step" DEFAULT 'restaurant_info',
	"total_steps" integer DEFAULT 5,
	"completed_steps" integer DEFAULT 0,
	"skipped_steps" jsonb DEFAULT '[]',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"data" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "owner_onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"step_name" "onboarding_step" NOT NULL,
	"status" "owner_onboarding_status" DEFAULT 'not_started',
	"step_data" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"pay_date" date NOT NULL,
	"frequency" varchar NOT NULL,
	"location_id" uuid NOT NULL,
	"status" varchar DEFAULT 'draft',
	"total_gross_pay" numeric(12, 2) DEFAULT '0',
	"total_deductions" numeric(12, 2) DEFAULT '0',
	"total_net_pay" numeric(12, 2) DEFAULT '0',
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pay_stubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paycheck_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"stub_data" text NOT NULL,
	"viewed_at" timestamp,
	"downloaded_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paycheck_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"paycheck_layout" "paycheck_layout" DEFAULT 'check_stub_only' NOT NULL,
	"display_last4_ssn" boolean DEFAULT true,
	"display_tax_filing_name" boolean DEFAULT true,
	"display_business_name" boolean DEFAULT true,
	"print_signature" boolean DEFAULT false,
	"show_last_check_number" boolean DEFAULT true,
	"company_name" varchar(255) DEFAULT 'Your Company Name',
	"company_address" text DEFAULT 'Your Company Address',
	"company_phone" varchar(20),
	"company_ein" varchar(20),
	"business_name" varchar(255) DEFAULT 'Your Business Name',
	"tax_filing_name" varchar(255) DEFAULT 'Your Tax Filing Name',
	"bank_name" varchar(255) DEFAULT 'Your Bank Name',
	"routing_number" varchar(20),
	"account_number" varchar(20),
	"last_check_number" integer DEFAULT 1000,
	"signature_image_path" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paychecks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"check_number" varchar,
	"regular_hours" numeric(5, 2) DEFAULT '0.00',
	"overtime_hours" numeric(5, 2) DEFAULT '0.00',
	"hourly_rate" numeric(10, 2) DEFAULT '0.00',
	"regular_pay" numeric(10, 2) DEFAULT '0.00',
	"overtime_pay" numeric(10, 2) DEFAULT '0.00',
	"gross_pay" numeric(10, 2) DEFAULT '0.00',
	"federal_tax" numeric(10, 2) DEFAULT '0.00',
	"state_tax" numeric(10, 2) DEFAULT '0.00',
	"social_security" numeric(10, 2) DEFAULT '0.00',
	"medicare" numeric(10, 2) DEFAULT '0.00',
	"other_deductions" numeric(10, 2) DEFAULT '0.00',
	"total_deductions" numeric(10, 2) DEFAULT '0.00',
	"net_pay" numeric(10, 2) DEFAULT '0.00',
	"status" varchar DEFAULT 'pending',
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"calculation_type" varchar NOT NULL,
	"amount" numeric(10, 4),
	"is_pre_tax" boolean DEFAULT false,
	"is_employer_paid" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"pay_date" date NOT NULL,
	"status" varchar DEFAULT 'draft',
	"total_gross_pay" numeric(10, 2) DEFAULT '0.00',
	"total_net_pay" numeric(10, 2) DEFAULT '0.00',
	"total_deductions" numeric(10, 2) DEFAULT '0.00',
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paystubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"regular_hours" numeric(8, 2) DEFAULT '0',
	"overtime_hours" numeric(8, 2) DEFAULT '0',
	"regular_rate" numeric(10, 2) NOT NULL,
	"overtime_rate" numeric(10, 2),
	"regular_pay" numeric(12, 2) DEFAULT '0',
	"overtime_pay" numeric(12, 2) DEFAULT '0',
	"bonuses" numeric(12, 2) DEFAULT '0',
	"tips" numeric(12, 2) DEFAULT '0',
	"gross_pay" numeric(12, 2) DEFAULT '0',
	"federal_tax" numeric(12, 2) DEFAULT '0',
	"state_tax" numeric(12, 2) DEFAULT '0',
	"social_security" numeric(12, 2) DEFAULT '0',
	"medicare" numeric(12, 2) DEFAULT '0',
	"other_deductions" numeric(12, 2) DEFAULT '0',
	"total_deductions" numeric(12, 2) DEFAULT '0',
	"net_pay" numeric(12, 2) DEFAULT '0',
	"status" varchar DEFAULT 'calculated',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pos_employee_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pos_employee_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" varchar NOT NULL,
	"confidence" numeric(3, 2),
	"match_rule" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "pos_employee_mappings_pos_employee_id_unique" UNIQUE("pos_employee_id")
);
--> statement-breakpoint
CREATE TABLE "pos_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pos_integration_id" uuid NOT NULL,
	"pos_employee_id" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"email" varchar,
	"phone" varchar,
	"role_title" varchar,
	"is_active" boolean DEFAULT true,
	"metadata" jsonb,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pos_timeclocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pos_integration_id" uuid NOT NULL,
	"pos_time_entry_id" varchar NOT NULL,
	"pos_employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"clock_in_at" timestamp NOT NULL,
	"clock_out_at" timestamp,
	"break_seconds" integer DEFAULT 0,
	"wage_cents" integer,
	"role_title" varchar,
	"status" varchar NOT NULL,
	"hr_time_entry_id" uuid,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"imported_by" varchar NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"import_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'processing',
	"total_rows" integer DEFAULT 0,
	"processed_rows" integer DEFAULT 0,
	"matched_items" integer DEFAULT 0,
	"new_items" integer DEFAULT 0,
	"price_updates" integer DEFAULT 0,
	"error_log" text,
	"processing_started" timestamp DEFAULT now(),
	"processing_completed" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"assigned_by" varchar NOT NULL,
	"assignment_type" varchar DEFAULT 'training',
	"priority" varchar DEFAULT 'normal',
	"notes" text,
	"due_date" timestamp,
	"status" varchar DEFAULT 'assigned',
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_cost_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"total_cost" numeric(10, 4) NOT NULL,
	"cost_per_serving" numeric(10, 4) NOT NULL,
	"margin_percentage" numeric(5, 2),
	"effective_date" timestamp DEFAULT now(),
	"ingredient_snapshot" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_productions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_produced" numeric(10, 2) NOT NULL,
	"actual_cost" numeric(10, 4),
	"theoretical_cost" numeric(10, 4),
	"variance" numeric(10, 4),
	"variance_percentage" numeric(5, 2),
	"batch_number" varchar,
	"produced_by" varchar,
	"production_date" timestamp DEFAULT now(),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"sale_date" timestamp DEFAULT now() NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"customer_count" integer DEFAULT 1,
	"payment_method" varchar(50),
	"pos_transaction_id" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"recipe_id" uuid,
	"item_name" varchar(200) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"cost_of_goods" numeric(10, 4),
	"profit_amount" numeric(10, 4),
	"profit_margin" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "team_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"file_url" varchar(500) NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"category" varchar DEFAULT 'other',
	"uploaded_by" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "unit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"from_unit" varchar(20) NOT NULL,
	"to_unit" varchar(20) NOT NULL,
	"conversion_factor" numeric(10, 6) NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "variance_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"inventory_item_id" uuid,
	"recipe_id" uuid,
	"analysis_date" date NOT NULL,
	"theoretical_usage" numeric(10, 4) NOT NULL,
	"actual_usage" numeric(10, 4) NOT NULL,
	"variance" numeric(10, 4) NOT NULL,
	"variance_percentage" numeric(5, 2) NOT NULL,
	"variance_cost" numeric(10, 2) NOT NULL,
	"variance_category" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendor_price_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"cost_per_unit" numeric(10, 2) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"case_cost" numeric(10, 2),
	"purchase_uom" varchar(20),
	"pack_qty" integer,
	"inner_size" numeric(10, 4),
	"inner_unit" varchar(20),
	"per_piece_cost" numeric(10, 4),
	"per_base_unit_cost" numeric(10, 6),
	"total_base_units" numeric(10, 4),
	"vendor_sku" varchar(100),
	"pack_size_raw" varchar(100),
	"minimum_order_quantity" numeric(10, 2) DEFAULT '1',
	"lead_time_days" integer DEFAULT 0,
	"is_preferred_vendor" boolean DEFAULT false,
	"notes" text,
	"effective_date" timestamp DEFAULT now(),
	"expiry_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"integration_id" varchar NOT NULL,
	"received_at" timestamp NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigned_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "location_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "category" SET DATA TYPE budget_category;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "period" SET DATA TYPE budget_period;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "employee_number" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "address" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "date_of_birth" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "hire_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "termination_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "status" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "inventory_items" ALTER COLUMN "unit" SET DEFAULT 'each';--> statement-breakpoint
ALTER TABLE "inventory_items" ALTER COLUMN "cost_per_unit" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "invoice_processing" ALTER COLUMN "status" SET DEFAULT 'pending_review';--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "message_type" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "priority" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 4);--> statement-breakpoint
ALTER TABLE "shifts" ALTER COLUMN "employee_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ALTER COLUMN "start_time" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "shifts" ALTER COLUMN "end_time" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "shifts" ALTER COLUMN "status" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "assigned_to" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "employee_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "clock_in_time" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "clock_in_time" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "status" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_name" varchar;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_phone" varchar;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pay_frequency" varchar DEFAULT 'biweekly';--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "display_name" varchar(100);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "purchase_unit" varchar(20) DEFAULT 'case' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "recipe_unit" varchar(20) DEFAULT 'lbs' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "conversion_factor" numeric(10, 4) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "cost_per_purchase_unit" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "servings_per_purchase_unit" integer;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "pack_size" varchar(100);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "case_quantity" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "case_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "price_per_lb" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "price_per_ga" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "price_per_oz" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "price_per_inner_unit" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "inner_unit" varchar(20);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "pieces_per_lb" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "oz_per_piece" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "oz_per_cup" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "cups_per_ga" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "pieces_per_case" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "yield_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "grade_low" integer;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "grade_high" integer;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "unit_cost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "total_cost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "invoice_processing" ADD COLUMN "fees" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_processing" ADD COLUMN "attachment_path" varchar(500);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "hr_addon_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "title" varchar;--> statement-breakpoint
ALTER TABLE "pos_menu_items" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "pos_menu_items" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "pos_sale_items" ADD COLUMN "served_by_pos_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "cashier_pos_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "hourly_rate_min" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "hourly_rate_max" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "responsibilities" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "portion_cost" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "location_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "selling_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "image_url" varchar(500);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "total_cost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "cost_per_serving" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "profit_margin" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "position_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "is_manual" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "added_by" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "square_customer_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "square_subscription_id" varchar;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "location_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_order_rules" ADD CONSTRAINT "auto_order_rules_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_order_rules" ADD CONSTRAINT "auto_order_rules_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_order_rules" ADD CONSTRAINT "auto_order_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_order_rules" ADD CONSTRAINT "auto_order_rules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_form_fields" ADD CONSTRAINT "document_form_fields_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_payroll_deduction_id_payroll_deductions_id_fk" FOREIGN KEY ("payroll_deduction_id") REFERENCES "public"."payroll_deductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_assignments" ADD CONSTRAINT "employee_document_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_assignments" ADD CONSTRAINT "employee_document_assignments_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_assignments" ADD CONSTRAINT "employee_document_assignments_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_responses" ADD CONSTRAINT "employee_document_responses_assignment_id_employee_document_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."employee_document_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_responses" ADD CONSTRAINT "employee_document_responses_field_id_document_form_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."document_form_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_template_id_onboarding_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."onboarding_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_assigned_mentor_id_employees_id_fk" FOREIGN KEY ("assigned_mentor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding_data" ADD CONSTRAINT "employee_onboarding_data_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding_data" ADD CONSTRAINT "employee_onboarding_data_token_id_onboarding_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."onboarding_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding_steps" ADD CONSTRAINT "employee_onboarding_steps_employee_onboarding_id_employee_onboarding_id_fk" FOREIGN KEY ("employee_onboarding_id") REFERENCES "public"."employee_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding_steps" ADD CONSTRAINT "employee_onboarding_steps_step_id_onboarding_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."onboarding_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_onboarding_steps" ADD CONSTRAINT "employee_onboarding_steps_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_signatures" ADD CONSTRAINT "employee_signatures_document_assignment_id_employee_document_assignments_id_fk" FOREIGN KEY ("document_assignment_id") REFERENCES "public"."employee_document_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_signatures" ADD CONSTRAINT "employee_signatures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuations" ADD CONSTRAINT "inventory_valuations_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuations" ADD CONSTRAINT "inventory_valuations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_template_id_onboarding_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."onboarding_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tokens" ADD CONSTRAINT "onboarding_tokens_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_onboarding" ADD CONSTRAINT "owner_onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_onboarding_steps" ADD CONSTRAINT "owner_onboarding_steps_onboarding_id_owner_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."owner_onboarding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_stubs" ADD CONSTRAINT "pay_stubs_paycheck_id_paychecks_id_fk" FOREIGN KEY ("paycheck_id") REFERENCES "public"."paychecks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_stubs" ADD CONSTRAINT "pay_stubs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paycheck_settings" ADD CONSTRAINT "paycheck_settings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paychecks" ADD CONSTRAINT "paychecks_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paychecks" ADD CONSTRAINT "paychecks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_employee_mappings" ADD CONSTRAINT "pos_employee_mappings_pos_employee_id_pos_employees_id_fk" FOREIGN KEY ("pos_employee_id") REFERENCES "public"."pos_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_employee_mappings" ADD CONSTRAINT "pos_employee_mappings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_employees" ADD CONSTRAINT "pos_employees_pos_integration_id_pos_integrations_id_fk" FOREIGN KEY ("pos_integration_id") REFERENCES "public"."pos_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_timeclocks" ADD CONSTRAINT "pos_timeclocks_pos_integration_id_pos_integrations_id_fk" FOREIGN KEY ("pos_integration_id") REFERENCES "public"."pos_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_timeclocks" ADD CONSTRAINT "pos_timeclocks_pos_employee_id_pos_employees_id_fk" FOREIGN KEY ("pos_employee_id") REFERENCES "public"."pos_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_timeclocks" ADD CONSTRAINT "pos_timeclocks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_timeclocks" ADD CONSTRAINT "pos_timeclocks_hr_time_entry_id_time_entries_id_fk" FOREIGN KEY ("hr_time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_imports" ADD CONSTRAINT "price_imports_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_imports" ADD CONSTRAINT "price_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_assignments" ADD CONSTRAINT "recipe_assignments_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_assignments" ADD CONSTRAINT "recipe_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_assignments" ADD CONSTRAINT "recipe_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_cost_history" ADD CONSTRAINT "recipe_cost_history_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_cost_history" ADD CONSTRAINT "recipe_cost_history_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_productions" ADD CONSTRAINT "recipe_productions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_productions" ADD CONSTRAINT "recipe_productions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_productions" ADD CONSTRAINT "recipe_productions_produced_by_users_id_fk" FOREIGN KEY ("produced_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_analysis" ADD CONSTRAINT "variance_analysis_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_analysis" ADD CONSTRAINT "variance_analysis_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_analysis" ADD CONSTRAINT "variance_analysis_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_catalog" ADD CONSTRAINT "vendor_price_catalog_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_catalog" ADD CONSTRAINT "vendor_price_catalog_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_employees_integration_employee_uq" ON "pos_employees" USING btree ("pos_integration_id","pos_employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_timeclocks_integration_entry_uq" ON "pos_timeclocks" USING btree ("pos_integration_id","pos_time_entry_id");--> statement-breakpoint
CREATE INDEX "pos_timeclocks_employee_clockin_idx" ON "pos_timeclocks" USING btree ("pos_employee_id","clock_in_at");--> statement-breakpoint
ALTER TABLE "pos_menu_items" ADD CONSTRAINT "pos_menu_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_menu_items" ADD CONSTRAINT "pos_menu_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_served_by_pos_employee_id_pos_employees_id_fk" FOREIGN KEY ("served_by_pos_employee_id") REFERENCES "public"."pos_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_cashier_pos_employee_id_pos_employees_id_fk" FOREIGN KEY ("cashier_pos_employee_id") REFERENCES "public"."pos_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_sale_items_server_idx" ON "pos_sale_items" USING btree ("served_by_pos_employee_id");--> statement-breakpoint
CREATE INDEX "pos_sales_cashier_idx" ON "pos_sales" USING btree ("cashier_pos_employee_id");--> statement-breakpoint
ALTER TABLE "departments" DROP COLUMN "budget";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "emergency_contact";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "subject";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "read_by";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "attachments";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "positions" DROP COLUMN "min_hourly_rate";--> statement-breakpoint
ALTER TABLE "positions" DROP COLUMN "max_hourly_rate";--> statement-breakpoint
ALTER TABLE "positions" DROP COLUMN "permissions";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "assigned_by";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "location_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "department_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "estimated_hours";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "completion_notes";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "attachments";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "is_recurring";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "recurrence_pattern";--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "overtime_hours";--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "location";--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "approved_by";--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "approved_at";