# Orbit Chat — React Frontend (Backend V3)

A responsive React + Vite frontend wired to the supplied Node/Express/MongoDB/Redis/Socket.IO backend. This project includes account flows, exact user search, direct/group conversations, E2EE message envelopes compatible with the backend, encrypted attachments, Socket.IO messaging, WebRTC 1:1 calls, message forwarding, privacy controls, device-key management, push subscription controls, and moderator report screens.

> **Honest security status:** the message crypto uses the backend's custom ECDH-P256 + HKDF-SHA256 + AES-256-GCM envelope format. It is **not Signal Protocol or Double Ratchet** and has not been independently audited. Do not describe this build as having Signal-level forward secrecy. Full key recovery, identity verification, automated prekey replenishment, and a secure multi-device ratchet lifecycle remain production work.

## Requirements
- Node.js 20+
- Backend V3 running and configured
- MongoDB configured on backend
- Redis configured for production backend sessions/adapter
- Browser with Web Crypto, IndexedDB, WebRTC, and service-worker support
- HTTPS in production; localhost is acceptable for development

## Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

PowerShell: `Copy-Item .env.example .env`.

Set `VITE_API_BASE_URL` and `VITE_SOCKET_URL` to the backend's public API and Socket.IO URLs. Do not put server secrets into `VITE_*` variables. For push notifications, set only the **public** VAPID key as `VITE_VAPID_PUBLIC_KEY`; the private VAPID key belongs only on the backend. For production WebRTC, configure a reliable TURN service using the VITE_TURN_* values and matching credentials on the client side.

## Implemented UI/API map

| Feature | Backend contract |
|---|---|
| Registration, login, logout, logout all | `/api/auth/*` |
| Email OTP and password reset | `/api/auth/email/*`, `/api/auth/password/reset/*` |
| Profile, blocked list and exact user search | `/api/users/me`, `/api/users/blocked`, `/api/users/search?q=` |
| Block/unblock/report | `/api/users/:id/block`, `/api/users/:id/report` |
| Privacy settings | `PATCH /api/users/me/privacy` |
| Push subscriptions | `/api/users/push-subscriptions` |
| Conversation/group management | `/api/conversations/*` |
| Message send/edit/delete/react/read/pin | `/api/messages/*` |
| Upload ciphertext | `POST /api/uploads` |
| Device public keys and bundles | `/api/e2ee/devices`, `/api/e2ee/users/:id/bundles` |
| Moderation dashboard | `/api/users/moderation/reports` |
| Realtime messages/typing/receipts/call signaling | Socket.IO events documented by backend source |

## Functional areas
- **Messaging:** REST history, Socket.IO new-message events, local decryption, reply, edit, delete, reactions, local search, forwarding with re-encryption for the destination conversation, and encrypted attachments.
- **Group E2EE:** message content-key envelopes are created for each member device returned by the backend. All recipients must have registered public device keys. This is a custom envelope design, not a ratcheting Signal session.
- **Voice/video:** direct chats use one-to-one WebRTC calls; group chats support audio/video calls using a peer-to-peer mesh. Group mesh bandwidth and device load grow with participant count, so use an SFU for larger groups. Configure TURN for reliable connections across restrictive NATs/firewalls.
- **Push:** service-worker notifications and subscription controls are included. This requires browser permission, HTTPS, a public VAPID key in the frontend, and correctly configured private VAPID credentials on the backend.
- **Privacy:** profile-photo/last-seen/read-receipt/phone discoverability controls use the backend's supported fields.
- **Devices:** view and revoke registered public device keys. Revoking keys may make old encrypted messages unreadable from that device.
- **Moderation:** report users from a direct chat and view/update reports for accounts authorized by backend `MODERATOR_IDS`.

## Run checks

```bash
npm run check
npm test
npm run build
```

These commands must be run locally after dependencies install. The archive was prepared in an environment where `npm install` timed out, so a successful build and live backend integration have **not** been verified here. Do not treat a ZIP integrity check as an application test.

## Important production gaps
- No Signal Protocol / Double Ratchet implementation or independent cryptographic audit.
- No SFU is included; group calls use peer-to-peer mesh and are intended for small groups.
- No robust identity safety-number verification or private-key recovery.
- Prekey replenishment and key rotation need a tested lifecycle.
- Push delivery depends on backend VAPID and browser/service-worker configuration.
- Live two-user, cross-server Redis, MongoDB, TURN, and notification integration tests remain required.
- The bearer token uses `sessionStorage` for compatibility with the current backend. This is accessible to JavaScript; an HttpOnly-cookie architecture would need corresponding backend changes.
