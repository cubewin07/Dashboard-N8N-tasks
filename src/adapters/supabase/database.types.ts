
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_users": {
                  Row: {
                    "display_name": string,"owner_employee_id": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "display_name": string,"owner_employee_id"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "display_name"?: string,"owner_employee_id"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_users_owner_employee_fk"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"appearances": {
                  Row: {
                    "doc": NonNullable<Json>,"employee_id": string,"updated_at": string,"updated_by": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "doc": NonNullable<Json>,"employee_id": string,"updated_at"?: string,"updated_by": string,"version"?: number
                  }
                  Update: {
                    "doc"?: NonNullable<Json>,"employee_id"?: string,"updated_at"?: string,"updated_by"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "appearances_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: true
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_rules": {
                  Row: {
                    "enabled": boolean,"id": string,"label": NonNullable<Json>,"level": Database["public"]['Enums']["approval_level"],"order": number,"when": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled": boolean,"id": string,"label": NonNullable<Json>,"level": Database["public"]['Enums']["approval_level"],"order": number,"when": NonNullable<Json>
                  }
                  Update: {
                    "enabled"?: boolean,"id"?: string,"label"?: NonNullable<Json>,"level"?: Database["public"]['Enums']["approval_level"],"order"?: number,"when"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"config_audit": {
                  Row: {
                    "action": string,"actor": string,"after": Json | null,"at": string,"before": Json | null,"entity": string,"entity_id": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor": string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity": string,"entity_id": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor"?: string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity"?: string,"entity_id"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"departments": {
                  Row: {
                    "active": boolean,"color_swatch": string,"floor_template": string,"hours": string,"icon": string,"id": string,"key": string,"label": NonNullable<Json>,"order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"color_swatch": string,"floor_template"?: string,"hours": string,"icon": string,"id": string,"key": string,"label": NonNullable<Json>,"order": number
                  }
                  Update: {
                    "active"?: boolean,"color_swatch"?: string,"floor_template"?: string,"hours"?: string,"icon"?: string,"id"?: string,"key"?: string,"label"?: NonNullable<Json>,"order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"employees": {
                  Row: {
                    "archived_at": string | null,"bio": Json | null,"created_at": string,"created_by": string,"department_id": string | null,"id": string,"kind": string,"model_tier_override": string | null,"name": string,"review_mode": string,"role_key": string,"specialties": (string)[],"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"bio"?: Json | null,"created_at"?: string,"created_by": string,"department_id"?: string | null,"id": string,"kind": string,"model_tier_override"?: string | null,"name": string,"review_mode": string,"role_key": string,"specialties"?: (string)[],"state": string
                  }
                  Update: {
                    "archived_at"?: string | null,"bio"?: Json | null,"created_at"?: string,"created_by"?: string,"department_id"?: string | null,"id"?: string,"kind"?: string,"model_tier_override"?: string | null,"name"?: string,"review_mode"?: string,"role_key"?: string,"specialties"?: (string)[],"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"platforms": {
                  Row: {
                    "def": NonNullable<Json>,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "def": NonNullable<Json>,"key": string
                  }
                  Update: {
                    "def"?: NonNullable<Json>,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"policy": {
                  Row: {
                    "doc": NonNullable<Json>,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "doc": NonNullable<Json>,"id"?: number
                  }
                  Update: {
                    "doc"?: NonNullable<Json>,"id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "def": NonNullable<Json>,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "def": NonNullable<Json>,"key": string
                  }
                  Update: {
                    "def"?: NonNullable<Json>,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shops": {
                  Row: {
                    "handle": string | null,"id": string,"name": string,"platform_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "handle"?: string | null,"id": string,"name": string,"platform_key": string
                  }
                  Update: {
                    "handle"?: string | null,"id"?: string,"name"?: string,"platform_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shops_platform_key_fkey"
      columns: ["platform_key"]
isOneToOne: false
      referencedRelation: "platforms"
      referencedColumns: ["key"]
    }
                  ]
                },"specialties": {
                  Row: {
                    "def": NonNullable<Json>,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "def": NonNullable<Json>,"key": string
                  }
                  Update: {
                    "def"?: NonNullable<Json>,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"task_types": {
                  Row: {
                    "def": NonNullable<Json>,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "def": NonNullable<Json>,"key": string
                  }
                  Update: {
                    "def"?: NonNullable<Json>,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_audit":
{ Args: { "p_action": string,"p_after": Json,"p_before": Json,"p_entity": string,"p_entity_id": string }; Returns: undefined
                           },
"_require_boss":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_require_keys":
{ Args: { "p": Json,"p_keys": (string)[] }; Returns: undefined
                           },
"app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"archive_employee":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"delete_approval_rule":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_role":
{ Args: { "p_key": string }; Returns: undefined
                           },
"delete_specialty":
{ Args: { "p_key": string }; Returns: undefined
                           },
"is_boss":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"reorder_approval_rules":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"reorder_departments":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"replace_config":
{ Args: { "p": Json }; Returns: undefined
                           },
"restore_employee":
{ Args: { "p_id": string }; Returns: undefined
                           },
"save_appearance":
{ Args: { "p_doc": Json,"p_employee_id": string,"p_expected_version": number }; Returns: number
                           },
"set_policy":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_approval_rule":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_department":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_employee":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_platform":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_role":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_shop":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_specialty":
{ Args: { "p": Json }; Returns: undefined
                           },
"upsert_task_type":
{ Args: { "p": Json }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "boss"|"stylist","approval_level": "reviewer"|"dept_manager"|"boss"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["boss", "stylist"],"approval_level": ["reviewer", "dept_manager", "boss"]
          }
        }
} as const
