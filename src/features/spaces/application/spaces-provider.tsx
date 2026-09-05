import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AssignBoarderLeaseInput, Bed, BoarderOccupancy, CreateBedspaceInput, CreateBoarderInput, CreateRoomInput, Property, Room, Tenant, UpdateBedspaceInput, UpdateBoarderInput, UpdatePropertyInput, UpdateRoomInput } from "@/lib/bedkeep/types";
import { createSpaceRepository } from "../data/create-space-repository";
import { userError } from "@/lib/user-error";

interface SpacesContextValue {
  loading: boolean; mutating: boolean; error: string;
  properties: Property[]; property: Property | null; rooms: Room[]; beds: Bed[]; boarders: Tenant[]; occupancyHistory: BoarderOccupancy[];
  refresh: () => Promise<void>; refreshCurrent: () => Promise<void>; switchProperty: (propertyId: string) => Promise<void>; createProperty: (name: string, city: string) => Promise<void>;
  createRoom: (input: Omit<CreateRoomInput, "propertyId">) => Promise<void>; createBedspace: (input: Omit<CreateBedspaceInput, "propertyId">) => Promise<void>;
  updateRoom: (roomId: string, input: UpdateRoomInput) => Promise<void>; deleteRoom: (roomId: string) => Promise<void>;
  updateBedspace: (bedspaceId: string, input: UpdateBedspaceInput) => Promise<void>; deleteBedspace: (bedspaceId: string) => Promise<void>;
  createBoarder: (input: Omit<CreateBoarderInput, "propertyId">) => Promise<void>; updateBoarder: (boarderId: string, input: UpdateBoarderInput) => Promise<void>;
  archiveBoarder: (boarderId: string) => Promise<void>; deleteBoarder: (boarderId: string) => Promise<void>;
  assignBoarder: (bedspaceId: string, boarderId: string, lease: AssignBoarderLeaseInput) => Promise<void>; transferBoarder: (boarderId: string, targetBedspaceId: string, monthlyRent: number) => Promise<void>; moveOutBoarder: (boarderId: string, endDate: string) => Promise<void>;
  updateProperty: (input: UpdatePropertyInput) => Promise<void>;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);
const activePropertyKey = "bahayrentahan.active-property";

export function SpacesProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(createSpaceRepository, []);
  const workspaceRequest = useRef(0);
  const [loading, setLoading] = useState(true); const [mutating, setMutating] = useState(false); const [error, setError] = useState("");
  const [properties, setProperties] = useState<Property[]>([]); const [property, setProperty] = useState<Property | null>(null); const [rooms, setRooms] = useState<Room[]>([]); const [beds, setBeds] = useState<Bed[]>([]); const [boarders, setBoarders] = useState<Tenant[]>([]); const [occupancyHistory, setOccupancyHistory] = useState<BoarderOccupancy[]>([]);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof repository.load>>) => {
    setProperty(snapshot.property);
    setProperties((items) => items.map((item) => item.id === snapshot.property.id ? snapshot.property : item));
    setRooms(snapshot.rooms);
    setBeds(snapshot.beds);
    setBoarders(snapshot.boarders);
    setOccupancyHistory(snapshot.occupancyHistory);
  }, [repository]);

  const loadWorkspace = useCallback(async (requestedPropertyId?: string) => {
    const request = ++workspaceRequest.current;
    setError("");
    try {
      const available = await repository.listProperties();
      setProperties(available);
      const stored = window.localStorage.getItem(activePropertyKey) || undefined;
      const selectedId = requestedPropertyId ?? stored ?? available[0]?.id;
      const validId = available.some((item) => item.id === selectedId) ? selectedId : available[0]?.id;
      const snapshot = await repository.load(validId);
      if (request !== workspaceRequest.current) return;
      window.localStorage.setItem(activePropertyKey, snapshot.property.id);
      applySnapshot(snapshot);
    } catch (caught) { if (request === workspaceRequest.current) setError(userError(caught, "Unable to load your workspace.")); }
    finally { if (request === workspaceRequest.current) setLoading(false); }
  }, [applySnapshot, repository]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  const refresh = useCallback(async () => { await loadWorkspace(property?.id); }, [loadWorkspace, property?.id]);
  const refreshCurrent = useCallback(async () => {
    if (!property?.id) return;
    const requestedId = property.id;
    const snapshot = await repository.load(property.id, { ensureCurrentPeriod: false });
    if (window.localStorage.getItem(activePropertyKey) !== requestedId) return;
    applySnapshot(snapshot);
  }, [applySnapshot, property?.id, repository]);
  const mutate = useCallback(async (work: () => Promise<void>) => {
    setMutating(true); setError("");
    try { await work(); await refreshCurrent(); }
    catch (caught) { setError(userError(caught, "The change could not be saved.")); throw caught; }
    finally { setMutating(false); }
  }, [refreshCurrent]);

  const requireProperty = useCallback(() => {
    if (!property) throw new Error("Property workspace is still loading.");
    return property;
  }, [property]);

  const value = useMemo<SpacesContextValue>(() => ({
    loading, mutating, error, properties, property, rooms, beds, boarders, occupancyHistory, refresh, refreshCurrent,
    async switchProperty(propertyId) { setLoading(true); await loadWorkspace(propertyId); },
    async createProperty(name, city) { setMutating(true); try { const id = await repository.createProperty(name, city); await loadWorkspace(id); } finally { setMutating(false); } },
    async createRoom(input) { const current = requireProperty(); await mutate(() => repository.createRoom({ ...input, propertyId: current.id })); },
    async createBedspace(input) { const current = requireProperty(); await mutate(() => repository.createBedspace({ ...input, propertyId: current.id })); },
    async updateRoom(roomId, input) { await mutate(() => repository.updateRoom(roomId, input)); },
    async deleteRoom(roomId) { await mutate(() => repository.deleteRoom(roomId)); },
    async updateBedspace(id, input) { await mutate(() => repository.updateBedspace(id, input)); },
    async deleteBedspace(id) { await mutate(() => repository.deleteBedspace(id)); },
    async createBoarder(input) { const current = requireProperty(); await mutate(() => repository.createBoarder({ ...input, propertyId: current.id })); },
    async updateBoarder(id, input) { await mutate(() => repository.updateBoarder(id, input)); },
    async archiveBoarder(id) { await mutate(() => repository.archiveBoarder(id)); },
    async deleteBoarder(id) { await mutate(() => repository.deleteBoarder(id)); },
    async assignBoarder(bedId, boarderId, lease) {
      const currentProperty = requireProperty();
      const selectedBed = beds.find((item) => item.id === bedId);
      const selectedBoarder = boarders.find((item) => item.id === boarderId);
      setMutating(true); setError("");
      try {
        const occupancyId = await repository.assignBoarder(bedId, boarderId, lease);
        if (selectedBed && selectedBoarder) {
          const bedName = `${selectedBed.room} · ${selectedBed.label}`;
          setBeds((items) => items.map((item) => item.id === bedId ? { ...item, status: "occupied", tenant: selectedBoarder.name, initials: selectedBoarder.initials, rent: lease.monthlyRent, dueLabel: undefined } : item));
          setBoarders((items) => items.map((item) => item.id === boarderId ? { ...item, bed: bedName, balance: 0, status: "current" } : item));
          setOccupancyHistory((items) => [{ id: occupancyId, boarderId, bedspace: bedName, monthlyRent: lease.monthlyRent, startDate: lease.startDate, status: "active" }, ...items]);
        }
        window.dispatchEvent(new CustomEvent("bahayrentahan:billing-changed", { detail: { propertyId: currentProperty.id } }));
        void refreshCurrent().catch((caught) => setError(userError(caught, "The workspace is saved but could not be refreshed.")));
      } catch (caught) {
        setError(userError(caught, "The boarder and lease could not be saved."));
        throw caught;
      } finally { setMutating(false); }
    },
    async transferBoarder(boarderId, bedId, rent) { await mutate(() => repository.transferBoarder(boarderId, bedId, rent)); },
    async moveOutBoarder(boarderId, endDate) { await mutate(() => repository.moveOutBoarder(boarderId, endDate)); },
    async updateProperty(input) { const current = requireProperty(); await mutate(() => repository.updateProperty(current.id, input)); },
  }), [beds, boarders, error, loadWorkspace, loading, mutate, mutating, occupancyHistory, properties, property, refresh, refreshCurrent, repository, requireProperty, rooms]);

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}

export function useSpaces() { const value = useContext(SpacesContext); if (!value) throw new Error("useSpaces must be used inside SpacesProvider"); return value; }
