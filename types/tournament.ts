export type TournamentSettings = {
  format?: {
    holes?: 9 | 18 | 36;
    round_count?: number;
    format_type?: "stroke" | "stableford" | "matchplay" | "scramble" | "shamble" | "bestball" | "calcutta";
    scoring_mode?: "gross" | "net" | "both";
  };

  handicap?: {
    source?: "index" | "torneo";
    max_m?: number;
    max_f?: number;
    allowance_percent?: number;
    rounding?: "none" | "nearest" | "floor" | "ceil";
  };

  registration?: {
    field_size_limit?: number;
    waitlist_enabled?: boolean;
    entry_fee?: number;
    currency?: "MXN" | "USD";
  };

  tee_sheet?: {
    start_type?: "shotgun" | "tee_times";
    start_time?: string;
    interval_minutes?: number;
  };
};

export type Tournament = {
  id: string;
  name: string;
  status: string;
  club_name: string | null;
  course_name: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  settings: TournamentSettings;
  created_at: string;
  updated_at: string;
};