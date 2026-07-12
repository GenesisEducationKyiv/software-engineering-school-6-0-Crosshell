CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"owner" varchar(256) NOT NULL,
	"repo" varchar(256) NOT NULL,
	"last_seen_tag" varchar(256),
	CONSTRAINT "owner_repo_unq" UNIQUE("owner","repo")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"email" varchar(256) NOT NULL,
	"repository_id" uuid NOT NULL,
	"confirmed" boolean DEFAULT false,
	"confirm_token" varchar(64) NOT NULL,
	"unsubscribe_token" varchar(64) NOT NULL,
	CONSTRAINT "subscriptions_confirm_token_unique" UNIQUE("confirm_token"),
	CONSTRAINT "subscriptions_unsubscribe_token_unique" UNIQUE("unsubscribe_token"),
	CONSTRAINT "email_repository_id_unq" UNIQUE("email","repository_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;