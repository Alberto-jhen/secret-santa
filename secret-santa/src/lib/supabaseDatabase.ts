import type { GiftIdea, GroupRecord } from '../models'

type GroupTable = {
  Row: GroupRecord & Record<string, unknown>
  Insert: Omit<GroupRecord, 'id' | 'last_activity_at'> & Record<string, unknown> & {
    id?: string
    last_activity_at?: string
  }
  Update: Partial<GroupRecord> & Record<string, unknown>
  Relationships: []
}

type GiftIdeaRow = GiftIdea & {
  group_id: string
  member_id: string
}

type GiftIdeaTable = {
  Row: GiftIdeaRow & Record<string, unknown>
  Insert: Omit<GiftIdeaRow, 'id' | 'created_at' | 'updated_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
  } & Record<string, unknown>
  Update: Partial<Pick<GiftIdeaRow, 'title' | 'url' | 'note' | 'updated_at'>> &
    Record<string, unknown>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      groups: GroupTable
      gift_ideas: GiftIdeaTable
    }
    Views: Record<string, never>
    Functions: Record<
      string,
      {
        Args: Record<string, unknown>
        Returns: unknown
      }
    >
  }
}
