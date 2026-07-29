/**
 * Guest identity model.
 *
 * Each app install gets one guest via `POST /guest/init`. Credentials are stored
 * permanently until uninstall/clear data — no relink, no installId.
 */

/** Storage key → persisted as `gsk:guest` by the storage providers. */
export const GUEST_STORAGE_KEY = 'guest';

/** Pending display name before guest credentials exist (first-install offline). */
export const GUEST_PENDING_NAME_KEY = 'guest:pending-name';

export interface GuestCredentials {
  guestId: string;
  secretToken: string;
  name?: string | null;
  /** When true, `name` is saved locally but not yet confirmed by the server. */
  nameSyncPending?: boolean;
}

/** Shape of the `POST /guest/init` response payload (inside the envelope). */
export interface InitGuestPayload {
  gameId: string;
  guestId: string;
  secretToken: string;
}

/** Shape of guest profile payloads (`PATCH /guest/name`). */
export interface GuestProfilePayload {
  gameId: string;
  guestId: string;
  name: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidGuestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isValidGuestCredentials(value: unknown): value is GuestCredentials {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<GuestCredentials>;
  return (
    isValidGuestId(record.guestId) &&
    typeof record.secretToken === 'string' &&
    record.secretToken.length > 0
  );
}
