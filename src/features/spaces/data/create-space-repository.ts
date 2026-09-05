import type { SpaceRepository } from "./space-repository";
import { SupabaseSpaceRepository } from "./supabase-space-repository";

export function createSpaceRepository(): SpaceRepository {
  return new SupabaseSpaceRepository();
}
