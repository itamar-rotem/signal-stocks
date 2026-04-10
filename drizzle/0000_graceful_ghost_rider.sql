CREATE TYPE "public"."alert_channel" AS ENUM('email');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('new_signal', 'state_change', 'watchlist_signal', 'target_stop_hit', 'daily_digest', 'earnings_warning');--> statement-breakpoint
CREATE TYPE "public"."ai_confidence" AS ENUM('Low', 'Medium', 'High');--> statement-breakpoint
CREATE TYPE "public"."exchange" AS ENUM('NYSE', 'NASDAQ', 'AMEX');--> statement-breakpoint
CREATE TYPE "public"."recommendation_state" AS ENUM('WATCH', 'BUY', 'HOLD', 'TAKE_PARTIAL_PROFIT', 'SELL', 'STOP_HIT', 'DOWNGRADED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."signal_outcome" AS ENUM('target_hit', 'stopped_out', 'expired', 'downgraded');--> statement-breakpoint
CREATE TYPE "public"."signal_source" AS ENUM('system', 'watchlist');--> statement-breakpoint
CREATE TYPE "public"."signal_strength" AS ENUM('medium', 'strong', 'very_strong');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('SIG-01', 'SIG-02', 'SIG-03', 'SIG-04', 'SIG-05', 'SIG-06', 'SIG-07');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'pro', 'premium');--> statement-breakpoint
CREATE TYPE "public"."watchlist_source" AS ENUM('manual', 'signal');--> statement-breakpoint
CREATE TABLE "daily_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"date" date NOT NULL,
	"open" numeric(12, 4) NOT NULL,
	"high" numeric(12, 4) NOT NULL,
	"low" numeric(12, 4) NOT NULL,
	"close" numeric(12, 4) NOT NULL,
	"volume" bigint NOT NULL,
	"ma150" numeric(12, 4),
	"ma200" numeric(12, 4),
	"ma150_slope" numeric(12, 6),
	"ma200_slope" numeric(12, 6)
);
--> statement-breakpoint
CREATE TABLE "fundamentals" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"quarter" varchar(7) NOT NULL,
	"revenue" bigint,
	"eps" numeric(10, 4),
	"gross_margin" numeric(6, 4),
	"operating_margin" numeric(6, 4),
	"net_margin" numeric(6, 4),
	"roe" numeric(6, 4),
	"roa" numeric(6, 4),
	"roic" numeric(6, 4),
	"revenue_growth_yoy" numeric(6, 4),
	"eps_growth" numeric(6, 4),
	"debt_to_equity" numeric(8, 4),
	"current_ratio" numeric(8, 4),
	"interest_coverage" numeric(10, 4),
	"fcf_yield" numeric(6, 4),
	"forward_pe" numeric(10, 4),
	"peg_ratio" numeric(8, 4),
	"ev_ebitda" numeric(10, 4),
	"fundamental_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"exchange" "exchange" NOT NULL,
	"sector" text,
	"industry" text,
	"market_cap" bigint,
	"avg_volume" bigint,
	"price" numeric(12, 4),
	"listing_date" date,
	"is_eligible" boolean DEFAULT false NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer NOT NULL,
	"outcome" "signal_outcome" NOT NULL,
	"entry_price" numeric(12, 4) NOT NULL,
	"exit_price" numeric(12, 4) NOT NULL,
	"actual_return_pct" numeric(7, 4) NOT NULL,
	"days_held" integer NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_outcomes_signal_id_unique" UNIQUE("signal_id")
);
--> statement-breakpoint
CREATE TABLE "signal_rationales" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer NOT NULL,
	"summary" text NOT NULL,
	"fundamental_thesis" text,
	"technical_context" text,
	"target_price" numeric(12, 4),
	"stop_loss" numeric(12, 4),
	"risk_reward" numeric(6, 2),
	"confidence" "ai_confidence",
	"strategy_note" text,
	"disclaimer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer NOT NULL,
	"state" "recommendation_state" NOT NULL,
	"previous_state" "recommendation_state",
	"target_price" numeric(12, 4),
	"stop_loss" numeric(12, 4),
	"trailing_stop" numeric(12, 4),
	"ai_update_text" text,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_state_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer NOT NULL,
	"from_state" "recommendation_state",
	"to_state" "recommendation_state" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_id" integer NOT NULL,
	"signal_type" "signal_type" NOT NULL,
	"strength" "signal_strength" NOT NULL,
	"volume_confirmed" boolean NOT NULL,
	"fundamental_score" numeric(5, 2),
	"signal_score" numeric(5, 2),
	"triggered_at" timestamp with time zone NOT NULL,
	"source" "signal_source" DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"alert_type" "alert_type" NOT NULL,
	"channel" "alert_channel" DEFAULT 'email' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stock_id" integer NOT NULL,
	"signal_id" integer,
	"entry_price" numeric(12, 4) NOT NULL,
	"entry_date" date NOT NULL,
	"shares" numeric(14, 4) NOT NULL,
	"exit_price" numeric(12, 4),
	"exit_date" date,
	"realized_pnl" numeric(14, 4),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" varchar(64) NOT NULL,
	"plan" "user_plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "watchlist_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"watchlist_id" integer NOT NULL,
	"status" text,
	"fundamental_grade" text,
	"entry_guidance" text,
	"alert_conditions" text,
	"risks" text,
	"ai_text" text,
	"recommendation" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stock_id" integer NOT NULL,
	"source" "watchlist_source" DEFAULT 'manual' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"total_signals" integer NOT NULL,
	"win_rate" numeric(5, 4),
	"avg_return" numeric(7, 4),
	"avg_hold_days" numeric(6, 2),
	"risk_reward_ratio" numeric(6, 2),
	"equity_value" numeric(14, 4),
	CONSTRAINT "simulation_snapshots_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "daily_prices" ADD CONSTRAINT "daily_prices_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundamentals" ADD CONSTRAINT "fundamentals_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_outcomes" ADD CONSTRAINT "signal_outcomes_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_rationales" ADD CONSTRAINT "signal_rationales_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_recommendations" ADD CONSTRAINT "signal_recommendations_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_state_log" ADD CONSTRAINT "signal_state_log_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trades" ADD CONSTRAINT "user_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trades" ADD CONSTRAINT "user_trades_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trades" ADD CONSTRAINT "user_trades_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_assessments" ADD CONSTRAINT "watchlist_assessments_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_prices_stock_date_idx" ON "daily_prices" USING btree ("stock_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "fundamentals_stock_quarter_idx" ON "fundamentals" USING btree ("stock_id","quarter");--> statement-breakpoint
CREATE UNIQUE INDEX "stocks_ticker_idx" ON "stocks" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "stocks_eligible_idx" ON "stocks" USING btree ("is_eligible");--> statement-breakpoint
CREATE INDEX "signal_recommendations_signal_state_idx" ON "signal_recommendations" USING btree ("signal_id","state");--> statement-breakpoint
CREATE INDEX "signal_state_log_signal_idx" ON "signal_state_log" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "signals_stock_idx" ON "signals" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX "signals_triggered_idx" ON "signals" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "user_trades_user_idx" ON "user_trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watchlists_user_idx" ON "watchlists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_user_stock_unique_idx" ON "watchlists" USING btree ("user_id","stock_id");