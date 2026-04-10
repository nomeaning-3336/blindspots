export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      arcade_games: {
        Row: {
          id: string;
          user_id: string;
          variant_key: "vanilla" | "drunkfish" | "weirdhorse";
          status: "active" | "finished";
          current_fen: string;
          state: Json | null;
          created_at: string;
          updated_at: string;
          last_played_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          variant_key: "vanilla" | "drunkfish" | "weirdhorse";
          status?: "active" | "finished";
          current_fen?: string;
          state?: Json | null;
          created_at?: string;
          updated_at?: string;
          last_played_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          variant_key?: "vanilla" | "drunkfish" | "weirdhorse";
          status?: "active" | "finished";
          current_fen?: string;
          state?: Json | null;
          created_at?: string;
          updated_at?: string;
          last_played_at?: string;
        };
        Relationships: [];
      };
      user_app_preferences: {
        Row: {
          user_id: string;
          theme:
            | "midnight"
            | "light"
            | "solarized"
            | "forest"
            | "ocean"
            | "crimson";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          theme?:
            | "midnight"
            | "light"
            | "solarized"
            | "forest"
            | "ocean"
            | "crimson";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          theme?:
            | "midnight"
            | "light"
            | "solarized"
            | "forest"
            | "ocean"
            | "crimson";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_llm_api_keys: {
        Row: {
          user_id: string;
          claude_api_key: string | null;
          gemini_api_key: string | null;
          minimax_api_key: string | null;
          openai_api_key: string | null;
          puter_api_key: string | null;
          claude_model: string | null;
          gemini_model: string | null;
          minimax_model: string | null;
          openai_model: string | null;
          puter_model: string | null;
          preferred_llm_provider: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          claude_api_key?: string | null;
          gemini_api_key?: string | null;
          minimax_api_key?: string | null;
          openai_api_key?: string | null;
          puter_api_key?: string | null;
          claude_model?: string | null;
          gemini_model?: string | null;
          minimax_model?: string | null;
          openai_model?: string | null;
          puter_model?: string | null;
          preferred_llm_provider?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          claude_api_key?: string | null;
          gemini_api_key?: string | null;
          minimax_api_key?: string | null;
          openai_api_key?: string | null;
          puter_api_key?: string | null;
          claude_model?: string | null;
          gemini_model?: string | null;
          minimax_model?: string | null;
          openai_model?: string | null;
          puter_model?: string | null;
          preferred_llm_provider?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_analyze_preferences: {
        Row: {
          user_id: string;
          limit_kind: "time" | "depth";
          time_limit_value: number;
          depth_limit_value: number;
          lines_shown: number;
          threads: number;
          board_theme:
            | "grey"
            | "light"
            | "solarized"
            | "forest"
            | "ocean"
            | "crimson"
            | "midnight";
          piece_theme:
            | "cburnett"
            | "alpha-wood"
            | "maestro"
            | "smart"
            | "staunty-wood"
            | "governor"
            | "companion";
          auto_coach_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          limit_kind?: "time" | "depth";
          time_limit_value?: number;
          depth_limit_value?: number;
          lines_shown?: number;
          threads?: number;
          board_theme?:
            | "grey"
            | "light"
            | "solarized"
            | "forest"
            | "ocean"
            | "crimson"
            | "midnight";
          piece_theme?:
            | "cburnett"
            | "alpha-wood"
            | "maestro"
            | "smart"
            | "staunty-wood"
            | "governor"
            | "companion";
          coach_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          limit_kind?: "time" | "depth";
          time_limit_value?: number;
          depth_limit_value?: number;
          lines_shown?: number;
          threads?: number;
          board_theme?:
            | "grey"
            | "light"
            | "solarized"
            | "forest"
            | "ocean"
            | "crimson"
            | "midnight";
          piece_theme?:
            | "cburnett"
            | "alpha-wood"
            | "maestro"
            | "smart"
            | "staunty-wood"
            | "governor"
            | "companion";
          coach_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      linked_chess_profiles: {
        Row: {
          user_id: string;
          provider: "chesscom" | "lichess";
          username: string;
          linked_at: string;
          preferred_performance_range_days: 15 | 30 | 90 | 365 | null;
          preferred_performance_game_type:
            | "all"
            | "bullet"
            | "blitz"
            | "rapid"
            | "classical"
            | "daily"
            | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          provider: "chesscom" | "lichess";
          username: string;
          linked_at: string;
          preferred_performance_range_days?: 15 | 30 | 90 | 365 | null;
          preferred_performance_game_type?:
            | "all"
            | "bullet"
            | "blitz"
            | "rapid"
            | "classical"
            | "daily"
            | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          provider?: "chesscom" | "lichess";
          username?: string;
          linked_at?: string;
          preferred_performance_range_days?: 15 | 30 | 90 | 365 | null;
          preferred_performance_game_type?:
            | "all"
            | "bullet"
            | "blitz"
            | "rapid"
            | "classical"
            | "daily"
            | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
