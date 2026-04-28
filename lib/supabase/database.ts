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
          raw_elo: number | null;
          initialization_status: string;
          initialization_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          provider: "chesscom" | "lichess";
          username: string;
          linked_at: string;
          raw_elo?: number | null;
          initialization_status?: string;
          initialization_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          provider?: "chesscom" | "lichess";
          username?: string;
          linked_at?: string;
          raw_elo?: number | null;
          initialization_status?: string;
          initialization_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_training_preferences: {
        Row: {
          user_id: string;
          sequence_length: number;
          opponent_mode: string;
          time_pressure_mode: string;
          opening_filter: Json;
          skill_level: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          sequence_length?: number;
          opponent_mode?: string;
          time_pressure_mode?: string;
          opening_filter?: Json;
          skill_level?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          sequence_length?: number;
          opponent_mode?: string;
          time_pressure_mode?: string;
          opening_filter?: Json;
          skill_level?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      training_sessions: {
        Row: {
          id: string;
          user_id: string;
          starting_fen: string;
          moves_played: Json;
          eval_preservation_score: number | null;
          opponent_mode: string;
          sequence_length: number;
          time_pressure_mode: string;
          reflection_note: string | null;
          position_fingerprint: Json | null;
          blindspot_cluster_id: string | null;
          elo_before: number;
          elo_after: number;
          elo_delta: number;
          k_factor: number;
          opponent_elo: number;
          expected_score: number;
          actual_score: number;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          starting_fen: string;
          moves_played?: Json;
          eval_preservation_score?: number | null;
          opponent_mode: string;
          sequence_length: number;
          time_pressure_mode?: string;
          reflection_note?: string | null;
          position_fingerprint?: Json | null;
          blindspot_cluster_id?: string | null;
          elo_before: number;
          elo_after: number;
          elo_delta: number;
          k_factor: number;
          opponent_elo: number;
          expected_score: number;
          actual_score: number;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          starting_fen?: string;
          moves_played?: Json;
          eval_preservation_score?: number | null;
          opponent_mode?: string;
          sequence_length?: number;
          time_pressure_mode?: string;
          reflection_note?: string | null;
          position_fingerprint?: Json | null;
          blindspot_cluster_id?: string | null;
          elo_before?: number;
          elo_after?: number;
          elo_delta?: number;
          k_factor?: number;
          opponent_elo?: number;
          expected_score?: number;
          actual_score?: number;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_sessions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_blindspot_profile: {
        Row: {
          user_id: string;
          blindspots_elo: number;
          rating_deviation: number;
          initial_skill_level: string | null;
          weakness_vector: Json;
          mastery_vector: Json;
          exploit_queue: Json;
          explore_queue: Json;
          revisit_queue: Json;
          mastered_queue: Json;
          recent_served_fens: Json;
          recent_served_modes: Json;
          bucket_stats: Json;
          total_sequences: number;
          last_session_at: string | null;
          profile_initialized: boolean;
          initialization_status: string;
          initialization_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          blindspots_elo?: number;
          rating_deviation?: number;
          initial_skill_level?: string | null;
          weakness_vector?: Json;
          mastery_vector?: Json;
          exploit_queue?: Json;
          explore_queue?: Json;
          revisit_queue?: Json;
          mastered_queue?: Json;
          recent_served_fens?: Json;
          recent_served_modes?: Json;
          bucket_stats?: Json;
          total_sequences?: number;
          last_session_at?: string | null;
          profile_initialized?: boolean;
          initialization_status?: string;
          initialization_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          blindspots_elo?: number;
          rating_deviation?: number;
          initial_skill_level?: string | null;
          weakness_vector?: Json;
          mastery_vector?: Json;
          exploit_queue?: Json;
          explore_queue?: Json;
          revisit_queue?: Json;
          mastered_queue?: Json;
          recent_served_fens?: Json;
          recent_served_modes?: Json;
          bucket_stats?: Json;
          total_sequences?: number;
          last_session_at?: string | null;
          profile_initialized?: boolean;
          initialization_status?: string;
          initialization_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_blindspot_profile_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
