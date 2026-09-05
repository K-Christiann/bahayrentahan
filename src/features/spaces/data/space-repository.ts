import type { AssignBoarderLeaseInput, Bed, BoarderOccupancy, CreateBedspaceInput, CreateBoarderInput, CreateRoomInput, Property, Room, Tenant, UpdateBedspaceInput, UpdateBoarderInput, UpdatePropertyInput, UpdateRoomInput } from "@/lib/bedkeep/types";

export interface SpaceSnapshot {
  property: Property;
  rooms: Room[];
  beds: Bed[];
  boarders: Tenant[];
  occupancyHistory: BoarderOccupancy[];
}

export interface SpaceLoadOptions {
  ensureCurrentPeriod?: boolean;
}

export interface SpaceRepository {
  listProperties(): Promise<Property[]>;
  load(propertyId?: string, options?: SpaceLoadOptions): Promise<SpaceSnapshot>;
  createProperty(name: string, city: string): Promise<string>;
  createRoom(input: CreateRoomInput): Promise<void>;
  createBedspace(input: CreateBedspaceInput): Promise<void>;
  updateRoom(roomId: string, input: UpdateRoomInput): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  updateBedspace(bedspaceId: string, input: UpdateBedspaceInput): Promise<void>;
  deleteBedspace(bedspaceId: string): Promise<void>;
  createBoarder(input: CreateBoarderInput): Promise<void>;
  updateBoarder(boarderId: string, input: UpdateBoarderInput): Promise<void>;
  archiveBoarder(boarderId: string): Promise<void>;
  deleteBoarder(boarderId: string): Promise<void>;
  assignBoarder(bedspaceId: string, boarderId: string, lease: AssignBoarderLeaseInput): Promise<string>;
  transferBoarder(boarderId: string, targetBedspaceId: string, monthlyRent: number): Promise<void>;
  moveOutBoarder(boarderId: string, endDate: string): Promise<void>;
  updateProperty(propertyId: string, input: UpdatePropertyInput): Promise<void>;
}
