import type { CreateNeedInput, Need } from "@/lib/bedkeep/types";
export interface NeedRepository { load(propertyId: string): Promise<Need[]>; create(input: CreateNeedInput): Promise<void>; update(id: string, input: Omit<CreateNeedInput, "propertyId">): Promise<void>; setStatus(id: string, status: Need["status"]): Promise<void>; delete(id: string): Promise<void>; }

