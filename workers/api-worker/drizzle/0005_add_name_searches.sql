CREATE TABLE "name_searches" (
	"name" text NOT NULL,
	"searcher_hash" text NOT NULL,
	"searched_on" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_searches_name_searcher_hash_searched_on_pk" PRIMARY KEY("name","searcher_hash","searched_on")
);
