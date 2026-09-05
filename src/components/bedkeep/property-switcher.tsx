import { useState } from "react";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { userError } from "@/lib/user-error";
import { duplicateError, normalizeText } from "@/lib/validation";

export function PropertySwitcher() {
  const { property, properties, switchProperty, createProperty, mutating } = useSpaces(); const { push } = useToast();
  const [open, setOpen] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState(""); const [city, setCity] = useState("");
  const dirty = createOpen && Boolean(name.trim() || city.trim()); const guardClose = useUnsavedChanges(dirty); const nameError = !normalizeText(name) ? "Property name is required." : duplicateError(normalizeText(name), properties.map((item) => item.name), "A property with this name already exists.");
  function openCreate() { setName(""); setCity(""); setCreateOpen(true); }
  function closeCreate() { guardClose(() => setCreateOpen(false)); }
  async function create() { if (nameError) return; try { await createProperty(normalizeText(name), normalizeText(city)); setCreateOpen(false); setOpen(false); setName(""); setCity(""); push({ title: "Property created", description: "The new workspace is ready." }); } catch (caught) { push({ tone: "error", title: "Property could not be created", description: userError(caught, "Please retry creating the property.") }); } }
  return <div className="property-switcher-wrap"><button className="property-switcher" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span className="property-icon"><Building2 /></span><span><strong>{property?.name || "BahayRentahan"}</strong><small>{property?.city || "Property workspace"}</small></span><ChevronDown /></button>{open && <div className="property-menu"><span className="menu-label">YOUR PROPERTIES</span>{properties.map((item) => <button key={item.id} className={item.id === property?.id ? "active" : ""} onClick={() => { void switchProperty(item.id); setOpen(false); }}><span><strong>{item.name}</strong><small>{item.city || "No location"}</small></span>{item.id === property?.id && <Check />}</button>)}<button className="add-property" onClick={openCreate}><Plus /> Add property</button></div>}<Dialog open={createOpen} onOpenChange={(next) => next ? setCreateOpen(true) : closeCreate()}><DialogContent className="assign-dialog form-dialog"><DialogHeader><DialogTitle>Add property</DialogTitle><DialogDescription>Create another owner-isolated BahayRentahan workspace.</DialogDescription></DialogHeader><div className="form-grid"><label className="form-field form-field-wide"><span>Property name</span><Input maxLength={100} aria-invalid={Boolean(nameError)} value={name} onChange={(event) => setName(event.target.value)} placeholder="Property name" /><FieldError>{nameError}</FieldError></label><label className="form-field form-field-wide"><span>City or location <small>Optional</small></span><Input maxLength={120} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Lipa City, Batangas" /></label></div><DialogFooter><Button variant="outline" onClick={closeCreate}>Cancel</Button><Button className="lime-button" disabled={mutating || Boolean(nameError)} onClick={create}>{mutating ? "Creating…" : "Create property"}</Button></DialogFooter></DialogContent></Dialog></div>;
}
