import { createContext, useContext, useState } from 'react';

// Lets a page (Dashboard, Live Board) report its last successful refresh time so
// the Topbar can show a shared "auto-refreshing · updated Ns ago" indicator.
const LiveStatusContext = createContext(null);

export function LiveStatusProvider({ children }) {
  const [lastUpdated, setLastUpdated] = useState(null);
  return (
    <LiveStatusContext.Provider value={{ lastUpdated, setLastUpdated }}>
      {children}
    </LiveStatusContext.Provider>
  );
}

export function useLiveStatus() {
  const ctx = useContext(LiveStatusContext);
  if (!ctx) throw new Error('useLiveStatus must be used within LiveStatusProvider');
  return ctx;
}
