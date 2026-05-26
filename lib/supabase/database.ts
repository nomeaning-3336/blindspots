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
          theme: "paper" | "dark";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          theme?: "paper" | "dark";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          theme?: "paper" | "dark";
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
          board_theme: "paper" | "dark";
          piece_theme:
            | "blindspots"
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
          board_theme?: "paper" | "dark";
          piece_theme?:
            | "blindspots"
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
          board_theme?: "paper" | "dark";
          piece_theme?:
            | "blindspots"
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
          id: string;
          user_id: string;
          provider: "chesscom" | "lichess";
          username: string;
          linked_at: string;
          raw_elo: number | null;
          initialization_status: string;
          initialization_completed_at: string | null;
          last_sync_at: string | null;
          last_game_id_seen: string | null;
          last_sync_status: "idle" | "running" | "success" | "error" | null;
          last_sync_error: string | null;
          last_sync_game_count: number;
          last_sync_mistake_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: "chesscom" | "lichess";
          username: string;
          linked_at: string;
          raw_elo?: number | null;
          initialization_status?: string;
          initialization_completed_at?: string | null;
          last_sync_at?: string | null;
          last_game_id_seen?: string | null;
          last_sync_status?: "idle" | "running" | "success" | "error" | null;
          last_sync_error?: string | null;
          last_sync_game_count?: number;
          last_sync_mistake_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "chesscom" | "lichess";
          username?: string;
          linked_at?: string;
          raw_elo?: number | null;
          initialization_status?: string;
          initialization_completed_at?: string | null;
          last_sync_at?: string | null;
          last_game_id_seen?: string | null;
          last_sync_status?: "idle" | "running" | "success" | "error" | null;
          last_sync_error?: string | null;
          last_sync_game_count?: number;
          last_sync_mistake_count?: number;
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
          position_evaluations: Json;
          filler_id: string | null;
          filler_origin: "random_position" | "lichess_puzzle" | null;
          candidate_metadata: Json;
          elo_before: number | null;
          elo_after: number | null;
          elo_delta: number | null;
          k_factor: number | null;
          opponent_elo: number | null;
          expected_score: number | null;
          actual_score: number | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          selected_training_item_id: string | null;
          queue_source: string | null;
          training_outcome: "pass" | "acceptable" | "fail" | null;
          average_cp_loss: number | null;
          max_single_cp_loss: number | null;
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
          position_evaluations?: Json;
          filler_id?: string | null;
          filler_origin?: "random_position" | "lichess_puzzle" | null;
          candidate_metadata?: Json;
          elo_before?: number | null;
          elo_after?: number | null;
          elo_delta?: number | null;
          k_factor?: number | null;
          opponent_elo?: number | null;
          expected_score?: number | null;
          actual_score?: number | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          selected_training_item_id?: string | null;
          queue_source?: string | null;
          training_outcome?: "pass" | "acceptable" | "fail" | null;
          average_cp_loss?: number | null;
          max_single_cp_loss?: number | null;
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
          position_evaluations?: Json;
          filler_id?: string | null;
          filler_origin?: "random_position" | "lichess_puzzle" | null;
          candidate_metadata?: Json;
          elo_before?: number | null;
          elo_after?: number | null;
          elo_delta?: number | null;
          k_factor?: number | null;
          opponent_elo?: number | null;
          expected_score?: number | null;
          actual_score?: number | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          selected_training_item_id?: string | null;
          queue_source?: string | null;
          training_outcome?: "pass" | "acceptable" | "fail" | null;
          average_cp_loss?: number | null;
          max_single_cp_loss?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "training_sessions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_sessions_selected_mistake_id_fkey";
            columns: ["selected_training_item_id"];
            referencedRelation: "user_training_items";
            referencedColumns: ["id"];
          },
        ];
      };
      user_training_items: {
        Row: {
          id: string;
          user_id: string;
          source_type: "own_game" | "imported_pgn" | "lichess_puzzle_filler" | "legacy_fallback";
          source_provider: string | null;
          source_game_id: string | null;
          source_game_url: string | null;
          linked_profile_id: string | null;
          game_played_at: string | null;
          ply: number | null;
          user_color: "white" | "black" | null;
          starting_fen: string;
          decision_fen: string | null;
          actual_move_uci: string | null;
          actual_move_san: string | null;
          best_move_uci: string | null;
          best_move_san: string | null;
          eval_before_cp: number | null;
          eval_after_cp: number | null;
          cp_loss: number | null;
          theme_tags: Json;
          opening_name: string | null;
          eco: string | null;
          status: "active" | "review" | "mastered" | "retired" | "deleted";
          interval_days: number;
          review_count: number;
          pass_count: number;
          acceptable_count: number;
          fail_count: number;
          last_attempt_at: string | null;
          next_review_at: string | null;
          first_ingested_at: string;
          last_served_at: string | null;
          served_count: number;
          mastered_at: string | null;
          retired_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: "own_game" | "imported_pgn" | "lichess_puzzle_filler" | "legacy_fallback";
          source_provider?: string | null;
          source_game_id?: string | null;
          source_game_url?: string | null;
          linked_profile_id?: string | null;
          game_played_at?: string | null;
          ply?: number | null;
          user_color?: "white" | "black" | null;
          starting_fen: string;
          decision_fen?: string | null;
          actual_move_uci?: string | null;
          actual_move_san?: string | null;
          best_move_uci?: string | null;
          best_move_san?: string | null;
          eval_before_cp?: number | null;
          eval_after_cp?: number | null;
          cp_loss?: number | null;
          theme_tags?: Json;
          opening_name?: string | null;
          eco?: string | null;
          status?: "active" | "review" | "mastered" | "retired" | "deleted";
          interval_days?: number;
          review_count?: number;
          pass_count?: number;
          acceptable_count?: number;
          fail_count?: number;
          last_attempt_at?: string | null;
          next_review_at?: string | null;
          first_ingested_at?: string;
          last_served_at?: string | null;
          served_count?: number;
          mastered_at?: string | null;
          retired_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: "own_game" | "imported_pgn" | "lichess_puzzle_filler" | "legacy_fallback";
          source_provider?: string | null;
          source_game_id?: string | null;
          source_game_url?: string | null;
          linked_profile_id?: string | null;
          game_played_at?: string | null;
          ply?: number | null;
          user_color?: "white" | "black" | null;
          starting_fen?: string;
          decision_fen?: string | null;
          actual_move_uci?: string | null;
          actual_move_san?: string | null;
          best_move_uci?: string | null;
          best_move_san?: string | null;
          eval_before_cp?: number | null;
          eval_after_cp?: number | null;
          cp_loss?: number | null;
          theme_tags?: Json;
          opening_name?: string | null;
          eco?: string | null;
          status?: "active" | "review" | "mastered" | "retired" | "deleted";
          interval_days?: number;
          review_count?: number;
          pass_count?: number;
          acceptable_count?: number;
          fail_count?: number;
          last_attempt_at?: string | null;
          next_review_at?: string | null;
          first_ingested_at?: string;
          last_served_at?: string | null;
          served_count?: number;
          mastered_at?: string | null;
          retired_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_mistakes_user_id_fkey";
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
          cluster_stats: Json;
          recent_clusters: Json;
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
          cluster_stats?: Json;
          recent_clusters?: Json;
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
          cluster_stats?: Json;
          recent_clusters?: Json;
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
      user_onboarding_state: {
        Row: {
          user_id: string;
          training_onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          training_onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          training_onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_onboarding_state_user_id_fkey";
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


