import { ShieldAlert } from "lucide-react";
import { BrandMark } from "@/components/bedkeep/brand-mark";

export function ConfigurationRequiredView() {
  return <main className="configuration-page">
    <section className="configuration-card">
      <BrandMark />
      <span className="configuration-icon"><ShieldAlert /></span>
      <span className="eyebrow">SERVICE UNAVAILABLE</span>
      <h1>BahayRentahan is not available yet.</h1>
      <p>The service connection has not been configured. Please contact the system administrator or try again later.</p>
      <small>No property data has been loaded.</small>
    </section>
  </main>;
}
