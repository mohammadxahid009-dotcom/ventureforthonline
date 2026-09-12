export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      game_progress: {
        Row: {
          completed: number
          created_at: string
          destination: Json | null
          expedition_active: boolean
          level: number
          trail: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: number
          created_at?: string
          destination?: Json | null
          expedition_active?: boolean
          level?: number
          trail?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: number
          created_at?: string
          destination?: Json | null
          expedition_active?: boolean
          level?: number
          trail?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hunt_players: {
        Row: {
          room_id: string
          user_id: string
          display_name: string
          status: "waiting" | "active" | "left" | "completed"
          joined_at: string
          completed_at: string | null
        }
        Insert: {
          room_id: string
          user_id: string
          display_name: string
          status?: "waiting" | "active" | "left" | "completed"
          joined_at?: string
          completed_at?: string | null
        }
        Update: {
          display_name?: string
          status?: "waiting" | "active" | "left" | "completed"
          joined_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      hunt_rooms: {
        Row: {
          id: string
          code: string
          mode: "team" | "vs"
          state: "waiting" | "active" | "finished" | "cancelled"
          host_user_id: string
          max_players: number
          created_at: string
          started_at: string | null
          finished_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          mode: "team" | "vs"
          state?: "waiting" | "active" | "finished" | "cancelled"
          host_user_id: string
          max_players?: number
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          mode?: "team" | "vs"
          state?: "waiting" | "active" | "finished" | "cancelled"
          host_user_id?: string
          max_players?: number
          started_at?: string | null
          finished_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hunt_targets: {
        Row: {
          room_id: string
          user_id: string
          destination: Json
          assigned_at: string
          completed_at: string | null
        }
        Insert: {
          room_id: string
          user_id: string
          destination: Json
          assigned_at?: string
          completed_at?: string | null
        }
        Update: {
          destination?: Json
          assigned_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      photo_memories: {
        Row: {
          created_at: string
          id: string
          lat: number
          lng: number
          size_m: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lat: number
          lng: number
          size_m?: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          size_m?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_hunt_target: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      create_hunt_room: {
        Args: { p_mode: string; p_display_name: string }
        Returns: Database["public"]["Tables"]["hunt_rooms"]["Row"]
      }
      join_hunt_room: {
        Args: { p_code: string; p_display_name: string }
        Returns: Database["public"]["Tables"]["hunt_rooms"]["Row"]
      }
      leave_hunt_room: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      set_hunt_target: {
        Args: { p_room_id: string; p_destination: Json }
        Returns: undefined
      }
      start_hunt_room: {
        Args: { p_room_id: string }
        Returns: Database["public"]["Tables"]["hunt_rooms"]["Row"]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
