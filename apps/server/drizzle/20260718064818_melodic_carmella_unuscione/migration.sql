CREATE TABLE `ai_configuration` (
	`id` text PRIMARY KEY,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`model` text,
	`paused` integer NOT NULL,
	`activated_at` text,
	`status` text NOT NULL,
	`last_checked_at` text,
	`last_succeeded_at` text,
	`next_check_at` text,
	`failure_count` integer NOT NULL,
	`error_code` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`source_document_id` text,
	`source_content_hash` text,
	`recorded_at` text NOT NULL,
	`state` text NOT NULL,
	`attempt_count` integer NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `ai_memory_builds` (
	`job_id` text PRIMARY KEY,
	`markdown` text NOT NULL,
	`next_source_index` integer NOT NULL,
	`source_document_ids` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_ai_memory_builds_job_id_ai_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `ai_jobs`(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_by_state_time` ON `ai_jobs` (`state`,`recorded_at`);