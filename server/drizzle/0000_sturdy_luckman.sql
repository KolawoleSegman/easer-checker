CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`friend_id` text NOT NULL,
	`status` text DEFAULT 'PENDING',
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_user_id_friend_id_unique` ON `friendships` (`user_id`,`friend_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`white_id` text NOT NULL,
	`black_id` text NOT NULL,
	`winner_id` text,
	`pgn_moves` text DEFAULT '',
	`started_at` integer DEFAULT CURRENT_TIMESTAMP,
	`ended_at` integer,
	`status` text DEFAULT 'ACTIVE'
);
--> statement-breakpoint
CREATE TABLE `moves` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`turn_number` integer NOT NULL,
	`from_square` text NOT NULL,
	`to_square` text NOT NULL,
	`captured_piece` text,
	`promoted_to_king` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`read` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `statistics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`wins` integer DEFAULT 0,
	`losses` integer DEFAULT 0,
	`draws` integer DEFAULT 0,
	`total_moves` integer DEFAULT 0,
	`average_time` integer,
	`max_win_streak` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statistics_user_id_unique` ON `statistics` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`elo_rating` integer DEFAULT 1200,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);