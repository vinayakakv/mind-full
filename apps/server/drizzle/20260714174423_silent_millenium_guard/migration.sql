CREATE TABLE `changes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT,
	`document_id` text NOT NULL,
	`changed_at` text NOT NULL,
	CONSTRAINT `fk_changes_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`created_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`schema_version` integer NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` text,
	`parent_id` text,
	`sort_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by_device_id` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `changes_by_document` ON `changes` (`document_id`);--> statement-breakpoint
CREATE INDEX `documents_by_type_time` ON `documents` (`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `documents_by_parent_type` ON `documents` (`parent_id`,`type`);--> statement-breakpoint
CREATE INDEX `documents_by_updated_at` ON `documents` (`updated_at`);