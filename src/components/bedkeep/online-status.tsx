import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function OnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [reconnected, setReconnected] = useState(false);
  const wasOffline = useRef(!navigator.onLine);
  useEffect(() => {
    let timer = 0;
    const update = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (!nextOnline) { wasOffline.current = true; setReconnected(false); }
      else if (wasOffline.current) { wasOffline.current = false; setReconnected(true); timer = window.setTimeout(() => setReconnected(false), 3200); }
    };
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!online) return <div className="offline-banner" role="status"><WifiOff />You’re offline. Loaded records remain visible; reconnect before saving changes.</div>;
  return reconnected ? <div className="offline-banner reconnected-banner" role="status"><Wifi />Connection restored. You can save changes again.</div> : null;
}
