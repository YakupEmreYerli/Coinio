CREATE TABLE `firefly_connections` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`token` text NOT NULL,
	`asset_account_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`initial_sync_done` integer DEFAULT false NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`excluded` text DEFAULT '{"subscriptions":[],"bills":[]}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `firefly_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`subscription_id` integer,
	`bill_id` text NOT NULL,
	`asset_account_id` text,
	`coinio_hash` text NOT NULL,
	`firefly_hash` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firefly_links_user_bill_unique` ON `firefly_links` (`user_id`,`bill_id`);--> statement-breakpoint
CREATE TABLE `firefly_payment_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`link_id` integer NOT NULL,
	`payment_id` integer,
	`journal_id` text NOT NULL,
	`group_id` text NOT NULL,
	`state` text DEFAULT 'linked' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `firefly_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firefly_payment_links_user_journal_unique` ON `firefly_payment_links` (`user_id`,`journal_id`);