ALTER TABLE `ai_memory_builds` ADD `memory_sections` text;--> statement-breakpoint
ALTER TABLE `ai_memory_builds` ADD `phase` text DEFAULT 'memory' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_memory_builds` ADD `week_start` text;--> statement-breakpoint
ALTER TABLE `ai_memory_builds` ADD `week_end` text;--> statement-breakpoint
ALTER TABLE `ai_memory_builds` ADD `week_sections` text;--> statement-breakpoint
ALTER TABLE `ai_memory_builds` ADD `week_source_index` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_memory_builds` ADD `week_source_document_ids` text DEFAULT '[]' NOT NULL;