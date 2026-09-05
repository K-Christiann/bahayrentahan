import ReactDOM from "react-dom/client";
import { BedKeepApp } from "@/components/bedkeep/bedkeep-app";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/bedkeep/error-boundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary><ToastProvider><AuthProvider><BedKeepApp /></AuthProvider></ToastProvider></ErrorBoundary>,
);
