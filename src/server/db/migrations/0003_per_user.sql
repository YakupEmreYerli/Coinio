CREATE TABLE `instance_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `instance_settings`("key", "value") SELECT "key", "value" FROM `settings` WHERE "key" IN ('lastFxDate', 'notifyEnvTelegramSeeded');--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "key", "value")
	SELECT (SELECT min("id") FROM `users`), "key", "value" FROM `settings`
	WHERE "key" NOT IN ('lastFxDate', 'notifyEnvTelegramSeeded') AND EXISTS (SELECT 1 FROM `users`);--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `user_id` integer REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `notification_channels` SET "user_id" = (SELECT min("id") FROM `users`);--> statement-breakpoint
DELETE FROM `notification_channels` WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE `notification_log` ADD `user_id` integer REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `notification_log` SET "user_id" = (SELECT min("id") FROM `users`);
