export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          item_id: string | null
          model: string
          output_tokens: number
          provider: string
          purpose: string
          tenant_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          item_id?: string | null
          model: string
          output_tokens?: number
          provider: string
          purpose: string
          tenant_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          item_id?: string | null
          model?: string
          output_tokens?: number
          provider?: string
          purpose?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_item_id_tenant_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inbound_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          id: string
          item_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          id?: string
          item_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          id?: string
          item_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_item_id_tenant_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inbound_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_settings: {
        Row: {
          category: string
          created_at: string
          mode: string
          tenant_id: string
        }
        Insert: {
          category: string
          created_at?: string
          mode: string
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          mode?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_customer_message_at: string | null
          participant_external_id: string | null
          participant_name: string | null
          platform: string
          social_account_id: string
          tenant_id: string
          zernio_conversation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_customer_message_at?: string | null
          participant_external_id?: string | null
          participant_name?: string | null
          platform: string
          social_account_id: string
          tenant_id: string
          zernio_conversation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_customer_message_at?: string | null
          participant_external_id?: string | null
          participant_name?: string | null
          platform?: string
          social_account_id?: string
          tenant_id?: string
          zernio_conversation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_social_account_id_tenant_id_fkey"
            columns: ["social_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          body: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          edited_body: string | null
          id: string
          idempotency_key: string
          item_id: string
          kb_entry_ids: string[]
          model: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          zernio_reply_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          edited_body?: string | null
          id?: string
          idempotency_key?: string
          item_id: string
          kb_entry_ids?: string[]
          model?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          zernio_reply_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          edited_body?: string | null
          id?: string
          idempotency_key?: string
          item_id?: string
          kb_entry_ids?: string[]
          model?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          zernio_reply_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_item_id_tenant_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inbound_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_items: {
        Row: {
          attempts: number
          author_name: string | null
          category: string | null
          classifier_scores: Json | null
          classifier_used: string | null
          confidence: number | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          next_run_at: string | null
          received_at: string
          social_account_id: string
          status: string
          tenant_id: string
          text: string
          zernio_comment_id: string | null
          zernio_message_id: string | null
          zernio_post_id: string | null
        }
        Insert: {
          attempts?: number
          author_name?: string | null
          category?: string | null
          classifier_scores?: Json | null
          classifier_used?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          next_run_at?: string | null
          received_at: string
          social_account_id: string
          status?: string
          tenant_id: string
          text: string
          zernio_comment_id?: string | null
          zernio_message_id?: string | null
          zernio_post_id?: string | null
        }
        Update: {
          attempts?: number
          author_name?: string | null
          category?: string | null
          classifier_scores?: Json | null
          classifier_used?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          next_run_at?: string | null
          received_at?: string
          social_account_id?: string
          status?: string
          tenant_id?: string
          text?: string
          zernio_comment_id?: string | null
          zernio_message_id?: string | null
          zernio_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_items_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inbound_items_social_account_id_tenant_id_fkey"
            columns: ["social_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inbound_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_entries: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          item_id: string
          name: string | null
          request: string | null
          tenant_id: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          item_id: string
          name?: string | null
          request?: string | null
          tenant_id: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          item_id?: string
          name?: string | null
          request?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_item_id_tenant_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inbound_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          content: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          media: Json
          scheduled_for: string | null
          status: string
          target_account_ids: string[]
          tenant_id: string
          zernio_post_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          media?: Json
          scheduled_for?: string | null
          status?: string
          target_account_ids?: string[]
          tenant_id: string
          zernio_post_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          media?: Json
          scheduled_for?: string | null
          status?: string
          target_account_ids?: string[]
          tenant_id?: string
          zernio_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          created_at: string
          id: string
          platform: string
          status: string
          tenant_id: string
          username: string | null
          zernio_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          status?: string
          tenant_id: string
          username?: string | null
          zernio_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          status?: string
          tenant_id?: string
          username?: string | null
          zernio_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          confidence_threshold: number
          created_at: string
          id: string
          name: string
          stripe_customer_id: string | null
          subscription_status: string
          zernio_profile_id: string | null
        }
        Insert: {
          confidence_threshold?: number
          created_at?: string
          id?: string
          name: string
          stripe_customer_id?: string | null
          subscription_status?: string
          zernio_profile_id?: string | null
        }
        Update: {
          confidence_threshold?: number
          created_at?: string
          id?: string
          name?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          zernio_profile_id?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
        }
        Insert: {
          error?: string | null
          event_type: string
          id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          source: string
        }
        Update: {
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

