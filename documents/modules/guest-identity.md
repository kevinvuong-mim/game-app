# Guest identity

Guest identity quản lý anonymous player cho `game-api`.

## Triết lý

- Mỗi lần cài app = một guest mới trên server.
- Không relink khi uninstall/clear data.
- `secretToken` vĩnh viễn — không TTL, không rotate.

## Storage

Logical keys (API của `StorageService`):

| Key                  | Nội dung                                                  |
| -------------------- | --------------------------------------------------------- |
| `guest`              | `{ guestId, secretToken, name?, nameSyncPending? }`       |
| `guest:pending-name` | Tên local khi chưa có credentials (first-install offline) |

Trên native Preferences / legacy localStorage, key vật lý có prefix `gsk:` (`gsk:guest`, …). IndexedDB dùng logical key **không** prefix. Web builds migrate one-shot từ legacy `localStorage` sang IndexedDB nếu còn dữ liệu cũ.

## `guest.init()` flow

1. Đọc `guest` từ storage.
2. Nếu có → `apiClient.setAuthToken(secretToken)`, xong (cold start không gọi mạng).
3. Nếu không → giữ `pending`, **không block** cold start; `POST /api/guest/init` chạy nền khi online.
4. Khi create xong → nếu `payload.gameId` **không khớp** `RuntimeConfig.gameId` thì **từ chối lưu credentials** (log error, giữ `pending`, retry khi online). Khớp thì lưu `{ guestId, secretToken }`, `markReady`, adopt pending name nếu có.

Nếu offline / create fail ở bước 3–4, guest ở `pending` và tự retry khi network online (`@capacitor/network` trên native, `window.online` trên web).

Khi API trả 401, `guest.recoverFromUnauthorized()`:

- Xóa credentials cũ (`guest`) và reset notification state (`notification-state-v1`)
- **Xóa** queue `game-sync:pending` — score cũ không được gắn sang guest mới
- Tạo guest mới qua `init()`, rồi re-bind FCM device token cho guest mới
- `ApiClient` **không** replay request cũ sau recovery (tránh gắn body của guest cũ)

`init()` và `recoverFromUnauthorized()` dùng mutex để tránh race khi retry song song.

## IAP linking

Khi guest trở thành `ready` (kể cả sau offline retry), `App.ts` gọi `iap.linkGuestUser(guestId)` → RevenueCat adapter `Purchases.logIn({ appUserID })` và sync entitlements từ server.

## Offline name sync

Đổi tên qua `guest.updateName()` (cho phép kể cả khi guest còn `pending`):

1. Cập nhật local ngay (`displayName` trong store + `saveLocal`). Tên normalize 1–26 chars (`PLAYER_NAME_MAX_LENGTH`).
2. Nếu đã có credentials → set `nameSyncPending: true` trên `guest`.
3. Nếu chưa có credentials → lưu `guest:pending-name`; khi guest create xong sẽ adopt sang credentials.
4. Gọi `PATCH /api/guest/name` khi guest `ready` và online.

`App.init` gọi `guest.flushPendingName()` sau `saveService.loadLocal()`. `guest.controller` cũng flush khi:

- `app:resume`
- `guest.onReady` (sau hydrate)
- `window.online` (web)
- `@capacitor/network` reconnect (native)

`saveLocal()` bị bỏ qua nếu gọi trước `loadLocal()` (boot race guard).

Sau sync thành công: `nameSyncPending: false`.

## Endpoints

### `POST /api/guest/init`

Body:

```json
{ "gameId": "MEMORA" }
```

Response (`data`):

```json
{
  "guestId": "uuid",
  "gameId": "MEMORA",
  "secretToken": "raw-token"
}
```

### `PATCH /api/guest/name`

Header: `Authorization: Bearer <secretToken>`

Body:

```json
{ "name": "PlayerOne" }
```

Client trim tên và từ chối chuỗi rỗng / dài hơn 26 ký tự trước khi gửi. Backend giới hạn tên ở 1–26 ký tự.

Backend contract đầy đủ: [Guest API](../../../game-api/documents/apis/guest.md).
