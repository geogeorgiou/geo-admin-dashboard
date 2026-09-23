// Mirrors supabase/migrations/20260923000000_household_finances.sql.
// Replace with `npx supabase gen types typescript --db-url "$SUPABASE_DB_URL"` output once the CLI is set up.

export type AccountType = "checking" | "savings" | "credit" | "investment" | "other";
export type HouseholdRole = "owner" | "member";

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      households: Table<
        { id: string; name: string; created_at: string },
        { id?: string; name: string; created_at?: string }
      >;
      household_members: Table<
        { household_id: string; user_id: string; role: HouseholdRole; created_at: string },
        { household_id: string; user_id: string; role?: HouseholdRole; created_at?: string }
      >;
      profiles: Table<
        {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        },
        { user_id: string; display_name?: string | null; avatar_url?: string | null }
      >;
      accounts: Table<
        {
          id: string;
          household_id: string;
          name: string;
          institution: string | null;
          type: AccountType;
          currency: string;
          archived_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          household_id: string;
          name: string;
          institution?: string | null;
          type?: AccountType;
          currency?: string;
          archived_at?: string | null;
        }
      >;
      account_holders: Table<{ account_id: string; user_id: string }, { account_id: string; user_id: string }>;
      monthly_flows: Table<
        {
          id: string;
          account_id: string;
          month: string;
          period: string;
          deposits: number;
          withdrawals: number;
          transfers_in: number;
          transfers_out: number;
          closing_balance: number | null;
          note: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          account_id: string;
          month: string;
          deposits?: number;
          withdrawals?: number;
          transfers_in?: number;
          transfers_out?: number;
          closing_balance?: number | null;
          note?: string | null;
        }
      >;
    };
    Views: {
      monthly_account_summary: {
        Row: {
          account_id: string;
          household_id: string;
          account_name: string;
          institution: string | null;
          account_type: AccountType;
          month: string;
          period: string;
          deposits: number;
          withdrawals: number;
          transfers_in: number;
          transfers_out: number;
          closing_balance: number | null;
          net: number;
          net_with_transfers: number;
          note: string | null;
        };
        Relationships: [];
      };
      monthly_household_summary: {
        Row: {
          household_id: string;
          month: string;
          period: string;
          accounts_reported: number;
          deposits: number;
          withdrawals: number;
          net: number;
          unmatched_transfers: number;
          balances_reported: number;
          closing_balance: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_household: { Args: { household_name: string }; Returns: string };
      add_household_member: { Args: { hid: string; member_email: string; member_role?: string }; Returns: string };
      is_household_member: { Args: { hid: string }; Returns: boolean };
      is_household_owner: { Args: { hid: string }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
