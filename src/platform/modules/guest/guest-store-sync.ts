import { guest } from './guest.service';
import { usePlatformStore } from '@platform/core/state';

export function syncGuestToStore(): void {
  const guestId = guest.getGuestId();
  const guestName = guest.getName();
  if (!guestId && !guestName) return;

  // Prefer guest-held name (including first-install offline pending) over hydrated defaults.
  usePlatformStore.getState().setUser({
    ...(guestId ? { id: guestId } : {}),
    ...(guestName ? { displayName: guestName } : {}),
  });
}

export function bindGuestStoreSync(): () => void {
  return guest.onReady(() => syncGuestToStore());
}
