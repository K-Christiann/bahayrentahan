import type { NeedRepository } from "./need-repository"; import { SupabaseNeedRepository } from "./supabase-need-repository";
export function createNeedRepository(): NeedRepository { return new SupabaseNeedRepository(); }
