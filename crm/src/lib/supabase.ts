import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://zyuldjccrpmvzlgdxmtk.supabase.co') as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTcxMTEsImV4cCI6MjA5MDE5MzExMX0.Zork4rU4pTMAa-2IFXeyzKLEsNP_xdna8VMS4DkDmP8') as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/login';
};

// Types
export interface PipelineStage {
  id: number;
  name: string;
  order_index: number;
  color: string;
}

export interface Lead {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  source?: string;
  stage_id: number;
  score: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  stage_name?: string;
  stage_color?: string;
  spin_phase?: string;
  last_message_at?: string;
  follow_up_count?: number;
  message_count?: number;
  is_active?: boolean;
}

export interface Conversation {
  id: string;
  lead_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  type: string;
  description?: string;
  from_stage_id?: number;
  to_stage_id?: number;
  created_at: string;
}
