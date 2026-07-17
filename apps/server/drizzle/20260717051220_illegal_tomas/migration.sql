CREATE TABLE `backup_runs` (
	`scheduled_for` text PRIMARY KEY,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`path` text,
	`size_bytes` integer,
	`error` text,
	`removed_at` text
);
