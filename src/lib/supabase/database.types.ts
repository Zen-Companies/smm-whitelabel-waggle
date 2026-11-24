export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }
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
          source: string
          tenant_id: string
        }
        ComputedFields: never
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
          source?: string
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
          source?: string
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
      alert_digest_entries: {
        Row: {
          alert_id: string
          claimed_at: string | null
          content: Json
          created_at: string
          id: string
          sent_at: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          alert_id: string
          claimed_at?: string | null
          content: Json
          created_at?: string
          id?: string
          sent_at?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          alert_id?: string
          claimed_at?: string | null
          content?: Json
          created_at?: string
          id?: string
          sent_at?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          details: Json
          id: string
          item_id: string | null
          kind: string
          last_error: string | null
          lead_id: string | null
          next_attempt_at: string | null
          provider_id: string | null
          sent_at: string | null
          social_account_id: string | null
          status: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          details?: Json
          id?: string
          item_id?: string | null
          kind: string
          last_error?: string | null
          lead_id?: string | null
          next_attempt_at?: string | null
          provider_id?: string | null
          sent_at?: string | null
          social_account_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          details?: Json
          id?: string
          item_id?: string | null
          kind?: string
          last_error?: string | null
          lead_id?: string | null
          next_attempt_at?: string | null
          provider_id?: string | null
          sent_at?: string | null
          social_account_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_item_id_tenant_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inbound_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "alerts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_social_account_id_tenant_id_fkey"
            columns: ["social_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_snapshots: {
        Row: {
          data: Json
          id: string
          key: string
          synced_at: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          data: Json
          id?: string
          key: string
          synced_at?: string
          tenant_id: string
        }
        Update: {
          data?: Json
          id?: string
          key?: string
          synced_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_snapshots_tenant_id_fkey"
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
        ComputedFields: never
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
        ComputedFields: never
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
      beta_access: {
        Row: {
          announced_at: string | null
          code_id: string | null
          invited_by: string | null
          joined_at: string
          user_id: string
          via: string
        }
        ComputedFields: never
        Insert: {
          announced_at?: string | null
          code_id?: string | null
          invited_by?: string | null
          joined_at?: string
          user_id: string
          via: string
        }
        Update: {
          announced_at?: string | null
          code_id?: string | null
          invited_by?: string | null
          joined_at?: string
          user_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_access_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "beta_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_attempts: {
        Row: {
          at: string
          id: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          at?: string
          id?: never
          user_id: string
        }
        Update: {
          at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      beta_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          max_uses: number | null
          uses: number
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          max_uses?: number | null
          uses?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          max_uses?: number | null
          uses?: number
        }
        Relationships: []
      }
      catch_ups: {
        Row: {
          account_key: string | null
          capped: boolean
          comments_found: number
          comments_read: number
          dm_access_missing: boolean
          handle: string | null
          read_at: string | null
          over_cap: number
          platform: string | null
          post_offset: number
          posts_read: number
          praise_and_tags: number
          response_messages: number
          response_answered: number
          sorted_at: string | null
          top_questions: Json | null
          top_questions_at: string | null
          top_questions_final_at: string | null
          top_questions_notice_dismissed_at: string | null
          top_questions_notice_dismissed_by: string | null
          zernio_account_id: string | null
          attempts: number
          comments_created: number
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          facts_found: number
          facts_found_at: string | null
          dm_offset: number
          dms_created: number
          finished_at: string | null
          id: string
          locked_at: string | null
          next_run_at: string
          posts_cursor: string | null
          social_account_id: string | null
          stage: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          account_key?: string | null
          capped?: boolean
          comments_found?: number
          comments_read?: number
          dm_access_missing?: boolean
          handle?: string | null
          read_at?: string | null
          over_cap?: number
          platform?: string | null
          post_offset?: number
          posts_read?: number
          praise_and_tags?: number
          response_messages?: number
          response_answered?: number
          sorted_at?: string | null
          top_questions?: Json | null
          top_questions_at?: string | null
          top_questions_final_at?: string | null
          top_questions_notice_dismissed_at?: string | null
          top_questions_notice_dismissed_by?: string | null
          zernio_account_id?: string | null
          attempts?: number
          comments_created?: number
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          facts_found?: number
          facts_found_at?: string | null
          dm_offset?: number
          dms_created?: number
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          next_run_at?: string
          posts_cursor?: string | null
          social_account_id?: string | null
          stage?: string
          tenant_id: string
        }
        Update: {
          account_key?: string | null
          capped?: boolean
          comments_found?: number
          comments_read?: number
          dm_access_missing?: boolean
          handle?: string | null
          read_at?: string | null
          over_cap?: number
          platform?: string | null
          post_offset?: number
          posts_read?: number
          praise_and_tags?: number
          response_messages?: number
          response_answered?: number
          sorted_at?: string | null
          top_questions?: Json | null
          top_questions_at?: string | null
          top_questions_final_at?: string | null
          top_questions_notice_dismissed_at?: string | null
          top_questions_notice_dismissed_by?: string | null
          zernio_account_id?: string | null
          attempts?: number
          comments_created?: number
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          facts_found?: number
          facts_found_at?: string | null
          dm_offset?: number
          dms_created?: number
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          next_run_at?: string
          posts_cursor?: string | null
          social_account_id?: string | null
          stage?: string
          tenant_id?: string
        }
        Relationships: []
      }
      connect_attempts: {
        Row: {
          connect_token: string | null
          error: string | null
          error_message: string | null
          error_reason: string | null
          id: string
          is_user_fixable: boolean | null
          mode: string | null
          organization_id: string | null
          outcome: string | null
          outcome_at: string | null
          platform: string
          platform_error: string | null
          returned_at: string | null
          stage: string | null
          started_at: string
          step: string | null
          tenant_id: string
          user_agent: string | null
          user_agent_class: string | null
          user_id: string | null
          zernio_account_id: string | null
          zernio_profile_id: string | null
          zernio_request_id: string | null
        }
        ComputedFields: never
        Insert: {
          connect_token?: string | null
          error?: string | null
          error_message?: string | null
          error_reason?: string | null
          id?: string
          is_user_fixable?: boolean | null
          mode?: string | null
          organization_id?: string | null
          outcome?: string | null
          outcome_at?: string | null
          platform: string
          platform_error?: string | null
          returned_at?: string | null
          stage?: string | null
          started_at?: string
          step?: string | null
          tenant_id: string
          user_agent?: string | null
          user_agent_class?: string | null
          user_id?: string | null
          zernio_account_id?: string | null
          zernio_profile_id?: string | null
          zernio_request_id?: string | null
        }
        Update: {
          connect_token?: string | null
          error?: string | null
          error_message?: string | null
          error_reason?: string | null
          id?: string
          is_user_fixable?: boolean | null
          mode?: string | null
          organization_id?: string | null
          outcome?: string | null
          outcome_at?: string | null
          platform?: string
          platform_error?: string | null
          returned_at?: string | null
          stage?: string | null
          started_at?: string
          step?: string | null
          tenant_id?: string
          user_agent?: string | null
          user_agent_class?: string | null
          user_id?: string | null
          zernio_account_id?: string | null
          zernio_profile_id?: string | null
          zernio_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connect_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          followed_up_at: string | null
          zernio_contact_id: string | null
          created_at: string
          id: string
          last_customer_message_at: string | null
          participant_external_id: string | null
          participant_name: string | null
          platform: string
          subject: string | null
          social_account_id: string
          tenant_id: string
          zernio_conversation_id: string
        }
        ComputedFields: never
        Insert: {
          followed_up_at?: string | null
          zernio_contact_id?: string | null
          created_at?: string
          id?: string
          last_customer_message_at?: string | null
          participant_external_id?: string | null
          participant_name?: string | null
          platform: string
          subject?: string | null
          social_account_id: string
          tenant_id: string
          zernio_conversation_id: string
        }
        Update: {
          followed_up_at?: string | null
          zernio_contact_id?: string | null
          created_at?: string
          id?: string
          last_customer_message_at?: string | null
          participant_external_id?: string | null
          participant_name?: string | null
          platform?: string
          subject?: string | null
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
      crm_events: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          details: Json
          event: string
          ghl_contact_id: string | null
          id: string
          last_error: string | null
          next_attempt_at: string | null
          organization_id: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          details?: Json
          event: string
          ghl_contact_id?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          organization_id?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          details?: Json
          event?: string
          ghl_contact_id?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          organization_id?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
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
          needs_human: boolean
          needs_human_reason: string | null
          nudged_at: string | null
          owner_written: boolean
          reply_via: string
          send_attempted_at: string | null
          sent_at: string | null
          status: string
          template: Json | null
          tenant_id: string
          zernio_reply_id: string | null
        }
        ComputedFields: never
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
          needs_human?: boolean
          needs_human_reason?: string | null
          nudged_at?: string | null
          owner_written?: boolean
          reply_via?: string
          send_attempted_at?: string | null
          sent_at?: string | null
          status?: string
          template?: Json | null
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
          needs_human?: boolean
          needs_human_reason?: string | null
          nudged_at?: string | null
          owner_written?: boolean
          reply_via?: string
          send_attempted_at?: string | null
          sent_at?: string | null
          status?: string
          template?: Json | null
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
      email_confirmations: {
        Row: {
          confirmed_at: string | null
          email: string
          sent_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          email: string
          sent_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          email?: string
          sent_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      email_opt_outs: {
        Row: {
          created_at: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          default_frequency: string
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_frequency?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_frequency?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_settings_changes: {
        Row: {
          after: string
          before: string | null
          changed_by: string | null
          created_at: string
          id: string
        }
        Insert: {
          after: string
          before?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          after?: string
          before?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          enabled: boolean
          id: string
          key: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          enabled: boolean
          id?: string
          key: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          key?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          contact_ok: boolean
          created_at: string
          follow_up: string
          id: string
          kind: string
          message: string
          organization_id: string | null
          page: string
          rating: string | null
          reason: string
          sent_to_ghl_at: string | null
          tenant_id: string | null
          type: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          contact_ok?: boolean
          created_at?: string
          follow_up?: string
          id?: string
          kind: string
          message?: string
          organization_id?: string | null
          page: string
          rating?: string | null
          reason?: string
          sent_to_ghl_at?: string | null
          tenant_id?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          contact_ok?: boolean
          created_at?: string
          follow_up?: string
          id?: string
          kind?: string
          message?: string
          organization_id?: string | null
          page?: string
          rating?: string | null
          reason?: string
          sent_to_ghl_at?: string | null
          tenant_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_nudges: {
        Row: {
          key: string
          outcome: string | null
          shown_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          key: string
          outcome?: string | null
          shown_at?: string
          user_id: string
        }
        Update: {
          key?: string
          outcome?: string | null
          shown_at?: string
          user_id?: string
        }
        Relationships: []
      }
      first_morning_emails: {
        Row: {
          catch_up_id: string | null
          created_at: string
          messages: number | null
          organization_id: string
          outcome: string
          reason: string | null
          replies: number | null
          sent_at: string | null
        }
        Insert: {
          catch_up_id?: string | null
          created_at?: string
          messages?: number | null
          organization_id: string
          outcome: string
          reason?: string | null
          replies?: number | null
          sent_at?: string | null
        }
        Update: {
          catch_up_id?: string | null
          created_at?: string
          messages?: number | null
          organization_id?: string
          outcome?: string
          reason?: string | null
          replies?: number | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "first_morning_emails_catch_up_id_fkey"
            columns: ["catch_up_id"]
            isOneToOne: false
            referencedRelation: "catch_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "first_morning_emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_settings: {
        Row: {
          enabled: boolean
          message: string
          sequences: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
          wait_minutes: number
          whatsapp_template: Json | null
        }
        ComputedFields: never
        Insert: {
          enabled?: boolean
          message: string
          sequences?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          wait_minutes?: number
          whatsapp_template?: Json | null
        }
        Update: {
          enabled?: boolean
          message?: string
          sequences?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          wait_minutes?: number
          whatsapp_template?: Json | null
        }
        Relationships: []
      }
      inbound_items: {
        Row: {
          catch_up_id: string | null
          draft_requested_at: string | null
          post_caption: string | null
          answered_on_platform_at: string | null
          attachments: Json
          attempts: number
          author_name: string | null
          call_duration_seconds: number | null
          call_voicemail: boolean | null
          category: string | null
          classifier_scores: Json | null
          classifier_used: string | null
          confidence: number | null
          conversation_id: string | null
          created_at: string
          hidden_on_platform_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          next_run_at: string | null
          permalink: string | null
          platform_message_id: string | null
          received_at: string
          review_recommends: boolean | null
          review_rating: number | null
          social_account_id: string
          status: string
          tenant_id: string
          text: string
          zernio_call_id: string | null
          zernio_comment_id: string | null
          zernio_message_id: string | null
          zernio_post_id: string | null
          zernio_review_id: string | null
        }
        ComputedFields: never
        Insert: {
          catch_up_id?: string | null
          draft_requested_at?: string | null
          post_caption?: string | null
          answered_on_platform_at?: string | null
          attachments?: Json
          attempts?: number
          author_name?: string | null
          call_duration_seconds?: number | null
          call_voicemail?: boolean | null
          category?: string | null
          classifier_scores?: Json | null
          classifier_used?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          hidden_on_platform_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          next_run_at?: string | null
          permalink?: string | null
          platform_message_id?: string | null
          received_at: string
          review_recommends?: boolean | null
          review_rating?: number | null
          social_account_id: string
          status?: string
          tenant_id: string
          text: string
          zernio_call_id?: string | null
          zernio_comment_id?: string | null
          zernio_message_id?: string | null
          zernio_post_id?: string | null
          zernio_review_id?: string | null
        }
        Update: {
          catch_up_id?: string | null
          draft_requested_at?: string | null
          post_caption?: string | null
          answered_on_platform_at?: string | null
          attachments?: Json
          attempts?: number
          author_name?: string | null
          call_duration_seconds?: number | null
          call_voicemail?: boolean | null
          category?: string | null
          classifier_scores?: Json | null
          classifier_used?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          hidden_on_platform_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          next_run_at?: string | null
          permalink?: string | null
          platform_message_id?: string | null
          received_at?: string
          review_recommends?: boolean | null
          review_rating?: number | null
          social_account_id?: string
          status?: string
          tenant_id?: string
          text?: string
          zernio_call_id?: string | null
          zernio_comment_id?: string | null
          zernio_message_id?: string | null
          zernio_post_id?: string | null
          zernio_review_id?: string | null
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
          checked_at: string | null
          checked_by: string | null
          content: string
          created_at: string
          embedding: string | null
          found_catch_up_id: string | null
          found_kind: string | null
          found_source: string | null
          id: string
          needs_check: boolean
          tenant_id: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          content: string
          created_at?: string
          embedding?: string | null
          found_catch_up_id?: string | null
          found_kind?: string | null
          found_source?: string | null
          id?: string
          needs_check?: boolean
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          content?: string
          created_at?: string
          embedding?: string | null
          found_catch_up_id?: string | null
          found_kind?: string | null
          found_source?: string | null
          id?: string
          needs_check?: boolean
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_entries_found_catch_up_id_fkey"
            columns: ["found_catch_up_id"]
            isOneToOne: false
            referencedRelation: "catch_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_suggestions: {
        Row: {
          content: string
          created_at: string
          decided_at: string | null
          id: string
          item_ids: string[]
          kb_entry_id: string | null
          status: string
          tenant_id: string
          title: string
        }
        ComputedFields: never
        Insert: {
          content?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          item_ids?: string[]
          kb_entry_id?: string | null
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          item_ids?: string[]
          kb_entry_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_suggestions_kb_entry_id_fkey"
            columns: ["kb_entry_id"]
            isOneToOne: false
            referencedRelation: "kb_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_cases: {
        Row: {
          created_at: string
          created_by: string | null
          expected_category: string
          id: string
          kind: string
          origin: string
          set_name: string
          tenant_id: string
          text: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_category: string
          id?: string
          kind: string
          origin?: string
          set_name: string
          tenant_id: string
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_category?: string
          id?: string
          kind?: string
          origin?: string
          set_name?: string
          tenant_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          origin: string
          results: Json
          tenant_id: string
          text: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          origin?: string
          results: Json
          tenant_id: string
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          origin?: string
          results?: Json
          tenant_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          followed_up_at: string | null
          contact: string | null
          created_at: string
          id: string
          item_id: string
          name: string | null
          request: string | null
          stage: string | null
          stage_changed_at: string | null
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          followed_up_at?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          item_id: string
          name?: string | null
          request?: string | null
          stage?: string | null
          stage_changed_at?: string | null
          tenant_id: string
        }
        Update: {
          followed_up_at?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          item_id?: string
          name?: string | null
          request?: string | null
          stage?: string | null
          stage_changed_at?: string | null
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
      mcp_calls: {
        Row: {
          args: Json
          at: string
          client_id: string
          client_name: string
          error_code: string | null
          id: string
          kind: string
          latency_ms: number | null
          playground: boolean
          status: string
          tenant_id: string | null
          tool: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          args?: Json
          at?: string
          client_id: string
          client_name?: string
          error_code?: string | null
          id?: string
          kind: string
          latency_ms?: number | null
          playground?: boolean
          status?: string
          tenant_id?: string | null
          tool: string
          user_id: string
        }
        Update: {
          args?: Json
          at?: string
          client_id?: string
          client_name?: string
          error_code?: string | null
          id?: string
          kind?: string
          latency_ms?: number | null
          playground?: boolean
          status?: string
          tenant_id?: string | null
          tool?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_grants: {
        Row: {
          client_id: string
          client_name: string
          created_at: string
          id: string
          tenant_ids: string[]
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          client_id: string
          client_name?: string
          created_at?: string
          id?: string
          tenant_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_name?: string
          created_at?: string
          id?: string
          tenant_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      media_uploads: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          done_at: string | null
          expires_at: string
          files: Json
          id: string
          issued: Json
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          done_at?: string | null
          expires_at: string
          files?: Json
          id?: string
          issued?: Json
          tenant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          done_at?: string | null
          expires_at?: string
          files?: Json
          id?: string
          issued?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      missed_messages: {
        Row: {
          category: string | null
          created_at: string
          id: string
          platform_message_id: string
          received_at: string
          sender_name: string | null
          social_account_id: string
          tenant_id: string
          text: string
          zernio_conversation_id: string
        }
        ComputedFields: never
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          platform_message_id: string
          received_at: string
          sender_name?: string | null
          social_account_id: string
          tenant_id: string
          text?: string
          zernio_conversation_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          platform_message_id?: string
          received_at?: string
          sender_name?: string | null
          social_account_id?: string
          tenant_id?: string
          text?: string
          zernio_conversation_id?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          email_frequency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email_frequency: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email_frequency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string
          details: Json
          id: string
          item_id: string | null
          kind: string
          needs_action: boolean
          post_id: string | null
          read_at: string | null
          social_account_id: string | null
          tenant_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          dedupe_key: string
          details?: Json
          id?: string
          item_id?: string | null
          kind: string
          needs_action?: boolean
          post_id?: string | null
          read_at?: string | null
          social_account_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          details?: Json
          id?: string
          item_id?: string | null
          kind?: string
          needs_action?: boolean
          post_id?: string | null
          read_at?: string | null
          social_account_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_item_id_tenant_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inbound_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "notifications_social_account_id_tenant_id_fkey"
            columns: ["social_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_audit: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          id: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          all_brands: boolean
          cancelled_at: string | null
          created_at: string
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          tenant_ids: string[]
          token_hash: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          all_brands?: boolean
          cancelled_at?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role: string
          tenant_ids?: string[]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          all_brands?: boolean
          cancelled_at?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          tenant_ids?: string[]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_member_brands: {
        Row: {
          organization_id: string
          tenant_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          organization_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          organization_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_member_brands_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "organization_member_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          all_brands: boolean
          created_at: string
          invited_by: string | null
          organization_id: string
          role: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          all_brands?: boolean
          created_at?: string
          invited_by?: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          all_brands?: boolean
          created_at?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          personal_of: string | null
          picture_path: string | null
        }
        ComputedFields: never
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          personal_of?: string | null
          picture_path?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          personal_of?: string | null
          picture_path?: string | null
        }
        Relationships: []
      }
      org_billing: {
        Row: {
          auto_top_up: boolean
          billing_interval: string | null
          cancel_at_period_end: boolean
          current_period_end: string | null
          extra_accounts: number
          founding: boolean
          organization_id: string
          plan: string | null
          status: string | null
          stripe_customer_id: string
          stripe_event_at: string | null
          stripe_subscription_id: string | null
          trial_days: number | null
          trial_ends_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          auto_top_up?: boolean
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          extra_accounts?: number
          founding?: boolean
          organization_id: string
          plan?: string | null
          status?: string | null
          stripe_customer_id: string
          stripe_event_at?: string | null
          stripe_subscription_id?: string | null
          trial_days?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_top_up?: boolean
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          extra_accounts?: number
          founding?: boolean
          organization_id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string
          stripe_event_at?: string | null
          stripe_subscription_id?: string | null
          trial_days?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      org_idle: {
        Row: {
          checked_at: string | null
          disconnect_on: string | null
          disconnected_account_ids: string[]
          disconnected_at: string | null
          last_active_at: string | null
          notice_dismissed_at: string | null
          organization_id: string
          updated_at: string
          warned_at: string | null
          warned_for_active_at: string | null
        }
        Insert: {
          checked_at?: string | null
          disconnect_on?: string | null
          disconnected_account_ids?: string[]
          disconnected_at?: string | null
          last_active_at?: string | null
          notice_dismissed_at?: string | null
          organization_id: string
          updated_at?: string
          warned_at?: string | null
          warned_for_active_at?: string | null
        }
        Update: {
          checked_at?: string | null
          disconnect_on?: string | null
          disconnected_account_ids?: string[]
          disconnected_at?: string | null
          last_active_at?: string | null
          notice_dismissed_at?: string | null
          organization_id?: string
          updated_at?: string
          warned_at?: string | null
          warned_for_active_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_idle_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_settings: {
        Row: {
          accounts: number | null
          auto_reply: boolean | null
          follow_ups: boolean | null
          for_sale: boolean | null
          leads_flagged: boolean | null
          replies: number | null
          team: boolean | null
          brands_limit: number | null
          plan: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          accounts?: number | null
          auto_reply?: boolean | null
          follow_ups?: boolean | null
          for_sale?: boolean | null
          leads_flagged?: boolean | null
          replies?: number | null
          team?: boolean | null
          brands_limit?: number | null
          plan: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounts?: number | null
          auto_reply?: boolean | null
          follow_ups?: boolean | null
          for_sale?: boolean | null
          leads_flagged?: boolean | null
          replies?: number | null
          team?: boolean | null
          brands_limit?: number | null
          plan?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      plan_settings_changes: {
        Row: {
          after: Json
          before: Json
          changed_by: string | null
          created_at: string
          id: string
          plan: string
        }
        ComputedFields: never
        Insert: {
          after: Json
          before: Json
          changed_by?: string | null
          created_at?: string
          id?: string
          plan: string
        }
        Update: {
          after?: Json
          before?: Json
          changed_by?: string | null
          created_at?: string
          id?: string
          plan?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          last_signin: string | null
          last_signin_at: string | null
          platform: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          last_signin?: string | null
          last_signin_at?: string | null
          platform: string
          status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          last_signin?: string | null
          last_signin_at?: string | null
          platform?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_settings_changes: {
        Row: {
          after: string
          before: string | null
          changed_by: string | null
          created_at: string
          id: string
          platform: string
        }
        ComputedFields: never
        Insert: {
          after: string
          before?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          platform: string
        }
        Update: {
          after?: string
          before?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          platform?: string
        }
        Relationships: []
      }
      platform_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        ComputedFields: never
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      post_metrics: {
        Row: {
          caption: string
          clicks: number
          comments: number
          engagement_rate: number
          format: string
          id: string
          impressions: number
          is_external: boolean
          likes: number
          permalink: string | null
          platform: string
          provider_post_id: string
          published_at: string | null
          reach: number
          saves: number
          shares: number
          sync_status: string
          synced_at: string
          tenant_id: string
          thumbnail_url: string | null
          timeline: Json | null
          timeline_synced_at: string | null
          views: number
          zernio_post_id: string | null
        }
        ComputedFields: never
        Insert: {
          caption?: string
          clicks?: number
          comments?: number
          engagement_rate?: number
          format?: string
          id?: string
          impressions?: number
          is_external?: boolean
          likes?: number
          permalink?: string | null
          platform: string
          provider_post_id: string
          published_at?: string | null
          reach?: number
          saves?: number
          shares?: number
          sync_status?: string
          synced_at?: string
          tenant_id: string
          thumbnail_url?: string | null
          timeline?: Json | null
          timeline_synced_at?: string | null
          views?: number
          zernio_post_id?: string | null
        }
        Update: {
          caption?: string
          clicks?: number
          comments?: number
          engagement_rate?: number
          format?: string
          id?: string
          impressions?: number
          is_external?: boolean
          likes?: number
          permalink?: string | null
          platform?: string
          provider_post_id?: string
          published_at?: string | null
          reach?: number
          saves?: number
          shares?: number
          sync_status?: string
          synced_at?: string
          tenant_id?: string
          thumbnail_url?: string | null
          timeline?: Json | null
          timeline_synced_at?: string | null
          views?: number
          zernio_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      post_previews: {
        Row: {
          account_ids: string[]
          client_id: string
          content: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          media: Json
          options: Json
          post_id: string | null
          publish_at: string | null
          publish_mode: string
          tenant_id: string
          used_at: string | null
          youtube_title: string | null
        }
        ComputedFields: never
        Insert: {
          account_ids: string[]
          client_id: string
          content: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          media?: Json
          options?: Json
          post_id?: string | null
          publish_at?: string | null
          publish_mode: string
          tenant_id: string
          used_at?: string | null
          youtube_title?: string | null
        }
        Update: {
          account_ids?: string[]
          client_id?: string
          content?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          media?: Json
          options?: Json
          post_id?: string | null
          publish_at?: string | null
          publish_mode?: string
          tenant_id?: string
          used_at?: string | null
          youtube_title?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          attempts: number
          content: string
          created_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          media: Json
          platform_options: Json
          queued: boolean
          next_attempt_at: string | null
          platform_results: Json
          published_at: string | null
          scheduled_for: string | null
          status: string
          taken_down_at: string | null
          target_account_ids: string[]
          tenant_id: string
          tiktok_consent_at: string | null
          zernio_post_id: string | null
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          content: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          media?: Json
          platform_options?: Json
          queued?: boolean
          next_attempt_at?: string | null
          platform_results?: Json
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          taken_down_at?: string | null
          target_account_ids?: string[]
          tenant_id: string
          tiktok_consent_at?: string | null
          zernio_post_id?: string | null
        }
        Update: {
          attempts?: number
          content?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          media?: Json
          platform_options?: Json
          queued?: boolean
          next_attempt_at?: string | null
          platform_results?: Json
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          taken_down_at?: string | null
          target_account_ids?: string[]
          tenant_id?: string
          tiktok_consent_at?: string | null
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
      promotion_changes: {
        Row: {
          action: string
          after: Json
          before: Json
          changed_by: string | null
          created_at: string
          id: string
          promotion_id: string
        }
        ComputedFields: never
        Insert: {
          action: string
          after: Json
          before: Json
          changed_by?: string | null
          created_at?: string
          id?: string
          promotion_id: string
        }
        Update: {
          action?: string
          after?: Json
          before?: Json
          changed_by?: string | null
          created_at?: string
          id?: string
          promotion_id?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          audience: string
          bar_cta: string
          bar_enabled: boolean
          bar_label: string
          bar_link: string
          bar_phone_cta: string
          bar_phone_text: string
          bar_text: string
          countdown: boolean
          created_at: string
          day_name_1: string
          day_name_2: string
          enabled: boolean
          ends_at: string | null
          headline: string
          id: string
          kind: string
          last_bar_label: string
          last_bar_phone_text: string
          last_bar_text: string
          last_day_name_1: string
          last_day_name_2: string
          last_day_starts_at: string | null
          last_headline: string
          last_subline: string
          name: string
          reward_months: number
          starts_at: string | null
          subline: string
          trial_days: number
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          audience?: string
          bar_cta?: string
          bar_enabled?: boolean
          bar_label?: string
          bar_link?: string
          bar_phone_cta?: string
          bar_phone_text?: string
          bar_text?: string
          countdown?: boolean
          created_at?: string
          day_name_1?: string
          day_name_2?: string
          enabled?: boolean
          ends_at?: string | null
          headline?: string
          id: string
          kind: string
          last_bar_label?: string
          last_bar_phone_text?: string
          last_bar_text?: string
          last_day_name_1?: string
          last_day_name_2?: string
          last_day_starts_at?: string | null
          last_headline?: string
          last_subline?: string
          name: string
          reward_months?: number
          starts_at?: string | null
          subline?: string
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          bar_cta?: string
          bar_enabled?: boolean
          bar_label?: string
          bar_link?: string
          bar_phone_cta?: string
          bar_phone_text?: string
          bar_text?: string
          countdown?: boolean
          created_at?: string
          day_name_1?: string
          day_name_2?: string
          enabled?: boolean
          ends_at?: string | null
          headline?: string
          id?: string
          kind?: string
          last_bar_label?: string
          last_bar_phone_text?: string
          last_bar_text?: string
          last_day_name_1?: string
          last_day_name_2?: string
          last_day_starts_at?: string | null
          last_headline?: string
          last_subline?: string
          name?: string
          reward_months?: number
          starts_at?: string | null
          subline?: string
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          organization_id: string
        }
        Insert: {
          code: string
          created_at?: string
          organization_id: string
        }
        Update: {
          code?: string
          created_at?: string
          organization_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referred_org_id: string
          referrer_org_id: string
          reward_cents: number
          reward_due_at: string | null
          rewarded_at: string | null
          status: string
          stripe_ref: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referred_org_id: string
          referrer_org_id: string
          reward_cents?: number
          reward_due_at?: string | null
          rewarded_at?: string | null
          status?: string
          stripe_ref?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referred_org_id?: string
          referrer_org_id?: string
          reward_cents?: number
          reward_due_at?: string | null
          rewarded_at?: string | null
          status?: string
          stripe_ref?: string | null
        }
        Relationships: []
      }
      reply_top_ups: {
        Row: {
          automatic: boolean
          created_at: string
          id: string
          organization_id: string
          replies: number
          stripe_ref: string
        }
        ComputedFields: never
        Insert: {
          automatic?: boolean
          created_at?: string
          id?: string
          organization_id: string
          replies: number
          stripe_ref: string
        }
        Update: {
          automatic?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          replies?: number
          stripe_ref?: string
        }
        Relationships: []
      }
      signin_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          next: string
          organization_id: string | null
          used_at: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          next: string
          organization_id?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          next?: string
          organization_id?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signin_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          backfill_from: string | null
          created_at: string
          id: string
          picture_checked_at: string | null
          picture_path: string | null
          picture_url: string | null
          pinterest_board_id: string | null
          pinterest_board_name: string | null
          platform: string
          released_at: string | null
          reviews_polled_at: string | null
          status: string
          tenant_id: string
          username: string | null
          zernio_account_id: string
        }
        ComputedFields: never
        Insert: {
          backfill_from?: string | null
          created_at?: string
          id?: string
          picture_checked_at?: string | null
          picture_path?: string | null
          picture_url?: string | null
          pinterest_board_id?: string | null
          pinterest_board_name?: string | null
          platform: string
          released_at?: string | null
          reviews_polled_at?: string | null
          status?: string
          tenant_id: string
          username?: string | null
          zernio_account_id: string
        }
        Update: {
          backfill_from?: string | null
          created_at?: string
          id?: string
          picture_checked_at?: string | null
          picture_path?: string | null
          picture_url?: string | null
          pinterest_board_id?: string | null
          pinterest_board_name?: string | null
          platform?: string
          released_at?: string | null
          reviews_polled_at?: string | null
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
      staff_members: {
        Row: {
          added_by: string | null
          created_at: string
          role: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          added_by?: string | null
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_role_permissions: {
        Row: {
          permission: string
          role: string
        }
        ComputedFields: never
        Insert: {
          permission: string
          role: string
        }
        Update: {
          permission?: string
          role?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        ComputedFields: never
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
          accounts_reconciled_at: string | null
          ai_monthly_cap_usd: number | null
          analytics_audience_at: string | null
          analytics_full_at: string | null
          analytics_synced_at: string | null
          auto_hide_spam: boolean
          business_profile: string
          business_profile_updated_at: string | null
          confidence_threshold: number
          created_at: string
          health_checked_at: string | null
          id: string
          is_test: boolean
          mcp_daily_send_cap: number | null
          name: string
          offboard_issue: string | null
          offboarded_at: string | null
          offboarded_by: string | null
          organization_id: string | null
          picture_account_id: string | null
          picture_path: string | null
          picture_source: string
          purge_after: string | null
          purge_tried_at: string | null
          purged_at: string | null
          replies_paused: boolean
          setup_passed_at: string | null
          setup_done_at: string | null
          setup_screen: string | null
          setup_chat: Json
          setup_chat_log: Json | null
          ai_profile: Json | null
          ai_profile_at: string | null
          name_pending: boolean
          name_guessed_from: string | null
          ask_first_topics: string[]
          setup_passed_by: string | null
          setup_passed_how: string | null
          stripe_customer_id: string | null
          subscription_status: string
          zernio_profile_id: string | null
        }
        ComputedFields: never
        Insert: {
          accounts_reconciled_at?: string | null
          ai_monthly_cap_usd?: number | null
          analytics_audience_at?: string | null
          analytics_full_at?: string | null
          analytics_synced_at?: string | null
          auto_hide_spam?: boolean
          business_profile?: string
          business_profile_updated_at?: string | null
          confidence_threshold?: number
          created_at?: string
          health_checked_at?: string | null
          id?: string
          is_test?: boolean
          mcp_daily_send_cap?: number | null
          name: string
          offboard_issue?: string | null
          offboarded_at?: string | null
          offboarded_by?: string | null
          organization_id?: string | null
          picture_account_id?: string | null
          picture_path?: string | null
          picture_source?: string
          purge_after?: string | null
          purge_tried_at?: string | null
          purged_at?: string | null
          replies_paused?: boolean
          setup_passed_at?: string | null
          setup_done_at?: string | null
          setup_screen?: string | null
          setup_chat?: Json
          setup_chat_log?: Json | null
          ai_profile?: Json | null
          ai_profile_at?: string | null
          name_pending?: boolean
          name_guessed_from?: string | null
          ask_first_topics?: string[]
          setup_passed_by?: string | null
          setup_passed_how?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          zernio_profile_id?: string | null
        }
        Update: {
          accounts_reconciled_at?: string | null
          ai_monthly_cap_usd?: number | null
          analytics_audience_at?: string | null
          analytics_full_at?: string | null
          analytics_synced_at?: string | null
          auto_hide_spam?: boolean
          business_profile?: string
          business_profile_updated_at?: string | null
          confidence_threshold?: number
          created_at?: string
          health_checked_at?: string | null
          id?: string
          is_test?: boolean
          mcp_daily_send_cap?: number | null
          name?: string
          offboard_issue?: string | null
          offboarded_at?: string | null
          offboarded_by?: string | null
          organization_id?: string | null
          picture_account_id?: string | null
          picture_path?: string | null
          picture_source?: string
          purge_after?: string | null
          purge_tried_at?: string | null
          purged_at?: string | null
          replies_paused?: boolean
          setup_passed_at?: string | null
          setup_done_at?: string | null
          setup_screen?: string | null
          setup_chat?: Json
          setup_chat_log?: Json | null
          ai_profile?: Json | null
          ai_profile_at?: string | null
          name_pending?: boolean
          name_guessed_from?: string | null
          ask_first_topics?: string[]
          setup_passed_by?: string | null
          setup_passed_how?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          zernio_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_reminders: {
        Row: {
          amount_cents: number
          billing_interval: string
          charge_at: string
          created_at: string
          organization_id: string
          plan: string
          reason: string | null
          sent_at: string | null
          status: string
          stripe_subscription_id: string
        }
        Insert: {
          amount_cents: number
          billing_interval?: string
          charge_at: string
          created_at?: string
          organization_id: string
          plan: string
          reason?: string | null
          sent_at?: string | null
          status?: string
          stripe_subscription_id: string
        }
        Update: {
          amount_cents?: number
          billing_interval?: string
          charge_at?: string
          created_at?: string
          organization_id?: string
          plan?: string
          reason?: string | null
          sent_at?: string | null
          status?: string
          stripe_subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_charges: {
        Row: {
          amount_cents: number | null
          created_at: string
          done_at: string | null
          id: string
          kind: string
          lines: Json | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
          stripe_invoice_id: string | null
        }
        ComputedFields: never
        Insert: {
          amount_cents?: number | null
          created_at?: string
          done_at?: string | null
          id?: string
          kind: string
          lines?: Json | null
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          stripe_invoice_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          lines?: Json | null
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          stripe_invoice_id?: string | null
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          inactive_sent_at: string | null
          last_seen_at: string
          user_id: string
        }
        Insert: {
          inactive_sent_at?: string | null
          last_seen_at?: string
          user_id: string
        }
        Update: {
          inactive_sent_at?: string | null
          last_seen_at?: string
          user_id?: string
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
        ComputedFields: never
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
      media_upload_add_file: {
        Args: { p_file: Json; p_id: string; p_max: number }
        Returns: boolean
      }
      media_upload_issue: {
        Args: { p_id: string; p_max: number; p_url: string }
        Returns: boolean
      }
      accept_invite: {
        Args: { p_token_hash: string; p_user: string }
        Returns: {
          organization_id: string
          status: string
        }[]
      }
      accept_invite_by_id: {
        Args: { p_invite: string; p_user: string }
        Returns: {
          organization_id: string
          status: string
        }[]
      }
      ai_spend_since: {
        Args: { p_since: string; p_tenant_id?: string }
        Returns: {
          spent_usd: number
          tenant_id: string
        }[]
      }
      cancel_invite: { Args: { p_actor: string; p_invite: string }; Returns: boolean }
      claim_items: {
        Args: { p_limit: number; p_per_tenant?: number; p_statuses?: string[] }
        Returns: {
          account_status: string
          attempts: number
          id: string
          kind: string
          social_account_id: string
          status: string
          tenant_id: string
        }[]
      }
      close_organization: { Args: { p_actor: string; p_org: string }; Returns: number }
      cost_by_item: {
        Args: { p_limit?: number; p_since: string }
        Returns: {
          ai_calls: number
          ai_cost_usd: number
          category: string
          item_id: string
          kind: string
          purposes: string[]
          received_at: string
          status: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      cost_by_tenant: {
        Args: { p_since: string }
        Returns: {
          ai_calls: number
          ai_cost_usd: number
          messages: number
          replies_sent: number
          tenant_id: string
          tenant_name: string
          zernio_profile_id: string
        }[]
      }
      create_brand: {
        Args: { p_name: string; p_user_id: string }
        Returns: {
          created: boolean
          tenant_id: string
        }[]
      }
      create_brand_in_org: {
        Args: { p_actor: string; p_name: string; p_org: string }
        Returns: {
          created: boolean
          tenant_id: string
        }[]
      }
      create_organization: { Args: { p_name: string; p_user: string }; Returns: string }
      create_owner_tenant: {
        Args: { p_name: string; p_user_id: string }
        Returns: {
          created: boolean
          tenant_id: string
        }[]
      }
      create_personal_org: { Args: { p_user: string }; Returns: string }
      decline_invite: { Args: { p_token_hash: string; p_user: string }; Returns: string }
      decline_invite_by_id: { Args: { p_invite: string; p_user: string }; Returns: string }
      disconnect_google: { Args: { p_user: string }; Returns: boolean }
      email_has_login: { Args: { p_email: string }; Returns: boolean }
      enqueue_draft_nudges: { Args: { p_older_than: string }; Returns: number }
      idle_check_candidates: {
        Args: { p_checked_before: string; p_limit: number }
        Returns: {
          organization_id: string
        }[]
      }
      invite_by_token: {
        Args: { p_token_hash: string }
        Returns: {
          all_brands: boolean
          email: string
          expires_at: string
          invite_id: string
          invited_by: string
          organization_id: string
          organization_name: string
          role: string
          status: string
          tenant_ids: string[]
        }[]
      }
      invite_member: {
        Args: {
          p_actor: string
          p_all_brands: boolean
          p_email: string
          p_org: string
          p_role: string
          p_tenant_ids: string[]
          p_token_hash: string
        }
        Returns: {
          invite_id: string
          status: string
        }[]
      }
      invites_for_user: {
        Args: { p_user: string }
        Returns: {
          all_brands: boolean
          brand_names: string[]
          expires_at: string
          invite_id: string
          invited_by: string
          organization_id: string
          organization_name: string
          role: string
        }[]
      }
      leave_organization: { Args: { p_org: string; p_user: string }; Returns: undefined }
      login_deletion_blockers: {
        Args: { p_user: string }
        Returns: {
          organization_id: string
          organization_name: string
        }[]
      }
      login_has_password: { Args: { p_user: string }; Returns: boolean }
      match_kb_entries: {
        Args: { p_limit?: number; p_query_embedding: string; p_tenant_id: string }
        Returns: {
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
      offboard_tenant: { Args: { p_actor: string; p_tenant_id: string }; Returns: string }
      organization_team: {
        Args: { p_org: string }
        Returns: {
          all_brands: boolean
          email: string
          full_name: string
          joined_at: string
          last_sign_in_at: string
          role: string
          tenant_ids: string[]
          user_id: string
        }[]
      }
      prepare_login_deletion: { Args: { p_user: string }; Returns: boolean }
      purge_tenant: { Args: { p_tenant_id: string }; Returns: boolean }
      redeem_beta_code: { Args: { p_code: string; p_user: string }; Returns: string }
      remove_member: {
        Args: { p_actor: string; p_org: string; p_user: string }
        Returns: undefined
      }
      rename_organization: {
        Args: { p_actor: string; p_name: string; p_org: string }
        Returns: undefined
      }
      resend_invite: {
        Args: { p_actor: string; p_invite: string; p_token_hash: string }
        Returns: boolean
      }
      restore_tenant: { Args: { p_actor: string; p_tenant_id: string }; Returns: boolean }
      set_member_brands: {
        Args: {
          p_actor: string
          p_all_brands: boolean
          p_org: string
          p_tenant_ids: string[]
          p_user: string
        }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_actor: string; p_org: string; p_role: string; p_user: string }
        Returns: undefined
      }
      transition_account_items: {
        Args: {
          p_from: string[]
          p_reason: string
          p_social_account_id: string
          p_tenant_id: string
          p_to: string
        }
        Returns: {
          from_status: string
          item_id: string
        }[]
      }
      transition_item: {
        Args: {
          p_details?: Json
          p_from: string
          p_item_id: string
          p_keep_lock?: boolean
          p_reason: string
          p_to: string
        }
        Returns: boolean
      }
      upsert_connected_account: {
        Args: {
          p_platform: string
          p_tenant_id: string
          p_username: string
          p_zernio_account_id: string
        }
        Returns: {
          account_id: string
          outcome: string
          previous_status: string
          previous_zernio_account_id: string
        }[]
      }
      user_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      user_id_by_email: { Args: { p_email: string }; Returns: string }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
