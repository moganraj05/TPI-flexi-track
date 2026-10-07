import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

// Whether the device has a network connection — the same signal TanStack
// Query uses to pause requests while offline and resume them on reconnect,
// so screens and data loading always agree. (A phone on Wi-Fi without
// internet still counts as online; those requests fail and show errors.)
export function useOnline() {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true
  );
}
