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
      fila_itens: {
        Row: {
          created_at: string
          doc_name: string | null
          external_id: string | null
          id: string
          lote_id: string
          media_url: string | null
          ordem: number
          text: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_name?: string | null
          external_id?: string | null
          id?: string
          lote_id: string
          media_url?: string | null
          ordem?: number
          text?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_name?: string | null
          external_id?: string | null
          id?: string
          lote_id?: string
          media_url?: string | null
          ordem?: number
          text?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fila_itens_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "fila_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_lotes: {
        Row: {
          categoria_origem: string | null
          created_at: string
          enviados: number
          erro: string | null
          falhas: number
          fecha_em: string
          id: string
          itens_count: number
          sender: string | null
          sender_name: string | null
          sender_phone: string | null
          sent_at: string | null
          source_chat_id: string | null
          source_group_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          categoria_origem?: string | null
          created_at?: string
          enviados?: number
          erro?: string | null
          falhas?: number
          fecha_em?: string
          id?: string
          itens_count?: number
          sender?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_at?: string | null
          source_chat_id?: string | null
          source_group_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          categoria_origem?: string | null
          created_at?: string
          enviados?: number
          erro?: string | null
          falhas?: number
          fecha_em?: string
          id?: string
          itens_count?: number
          sender?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_at?: string | null
          source_chat_id?: string | null
          source_group_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      grupos_caminhao: {
        Row: {
          created_at: string
          group_description: string | null
          group_jid: string | null
          group_name: string | null
          group_owner: string | null
          hits: number
          id: string
          info_error: string | null
          info_fetched_at: string | null
          invite_code: string
          invite_url: string
          last_seen_at: string
          message_text: string | null
          participants_count: number | null
          sender: string | null
          source_chat_id: string | null
          source_group_name: string | null
          status: string
        }
        Insert: {
          created_at?: string
          group_description?: string | null
          group_jid?: string | null
          group_name?: string | null
          group_owner?: string | null
          hits?: number
          id?: string
          info_error?: string | null
          info_fetched_at?: string | null
          invite_code: string
          invite_url: string
          last_seen_at?: string
          message_text?: string | null
          participants_count?: number | null
          sender?: string | null
          source_chat_id?: string | null
          source_group_name?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          group_description?: string | null
          group_jid?: string | null
          group_name?: string | null
          group_owner?: string | null
          hits?: number
          id?: string
          info_error?: string | null
          info_fetched_at?: string | null
          invite_code?: string
          invite_url?: string
          last_seen_at?: string
          message_text?: string | null
          participants_count?: number | null
          sender?: string | null
          source_chat_id?: string | null
          source_group_name?: string | null
          status?: string
        }
        Relationships: []
      }
      rotas_postagem: {
        Row: {
          ativo: boolean
          cabecalho: string | null
          categoria_origem: string
          created_at: string
          destino_chat_id: string
          destino_nome: string | null
          enviar_contato: boolean
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cabecalho?: string | null
          categoria_origem: string
          created_at?: string
          destino_chat_id: string
          destino_nome?: string | null
          enviar_contato?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cabecalho?: string | null
          categoria_origem?: string
          created_at?: string
          destino_chat_id?: string
          destino_nome?: string | null
          enviar_contato?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_groups: {
        Row: {
          ativo: boolean
          categoria: string
          chat_id: string
          created_at: string | null
          group_name: string | null
          id: string
          last_seen_at: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          chat_id: string
          created_at?: string | null
          group_name?: string | null
          id?: string
          last_seen_at?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          chat_id?: string
          created_at?: string | null
          group_name?: string | null
          id?: string
          last_seen_at?: string | null
        }
        Relationships: []
      }
      webhook_debug: {
        Row: {
          created_at: string
          hook: string
          id: string
          payload: Json | null
          resumo: string | null
        }
        Insert: {
          created_at?: string
          hook: string
          id?: string
          payload?: Json | null
          resumo?: string | null
        }
        Update: {
          created_at?: string
          hook?: string
          id?: string
          payload?: Json | null
          resumo?: string | null
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
  public: {
    Enums: {},
  },
} as const
