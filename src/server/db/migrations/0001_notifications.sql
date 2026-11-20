CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config` text NOT NULL,
	`secrets` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dedup_key` text NOT NULL,
	`type` text NOT NULL,
	`channel_id` integer,
	`subscription_id` integer,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`next_attempt_at` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_dedup_key_unique` ON `notification_log` (`dedup_key`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `reminder_offsets` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `trial_ends_at` text;--> statement-breakpoint
-- The old single "remind N days before" becomes a one-item list; the old default (1) follows the new defaults.
UPDATE `subscriptions` SET `reminder_offsets` = json_array(`reminder_days`) WHERE `reminder_days` <> 1;--> statement-breakpoint
-- The Telegram bot saved in Settings becomes an enabled Telegram channel.
INSERT INTO `notification_channels` (`type`, `name`, `enabled`, `config`, `secrets`, `created_at`, `updated_at`)
SELECT 'telegram', 'Telegram', 1, json_object('chatId', c.`value`), json_object('botToken', t.`value`),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `settings` t JOIN `settings` c ON t.`key` = 'telegramBotToken' AND c.`key` = 'telegramChatId';--> statement-breakpoint
DELETE FROM `settings` WHERE `key` IN ('telegramBotToken', 'telegramChatId', 'lastReminderDate');
