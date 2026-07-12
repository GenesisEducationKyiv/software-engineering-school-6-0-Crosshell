CREATE TABLE "saga_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "saga_instances_correlation_id_unique" UNIQUE("correlation_id")
);
