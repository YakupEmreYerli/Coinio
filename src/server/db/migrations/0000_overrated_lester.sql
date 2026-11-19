CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`rate` real NOT NULL,
	`date` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`base`, `quote`)
);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`client_secret` text,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`code_challenge` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`paid_at` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`actual_base_minor` integer,
	`source` text NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_subscription_due_unique` ON `payments` (`subscription_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`logo_path` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`variable_amount` integer DEFAULT false NOT NULL,
	`cycle` text NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`anchor_day` integer NOT NULL,
	`next_due` text NOT NULL,
	`auto_pay` integer DEFAULT true NOT NULL,
	`payment_method` text,
	`category` text,
	`notes` text,
	`reminder_days` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);