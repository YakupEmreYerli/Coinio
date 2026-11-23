CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `households_owner_user_id_unique` ON `households` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`role` text DEFAULT 'member' NOT NULL,
	`linked_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_linked_user_id_unique` ON `household_members` (`linked_user_id`);--> statement-breakpoint
CREATE INDEX `household_members_household_idx` ON `household_members` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`used_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `household_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invites_token_hash_unique` ON `household_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `household_invites_household_idx` ON `household_invites` (`household_id`);--> statement-breakpoint
CREATE TABLE `subscription_splits` (
	`subscription_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`share_minor` integer,
	PRIMARY KEY(`subscription_id`, `member_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `household_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD COLUMN `household_id` integer REFERENCES `households`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD COLUMN `paid_by_member_id` integer REFERENCES `household_members`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `subscriptions_household_idx` ON `subscriptions` (`household_id`);
