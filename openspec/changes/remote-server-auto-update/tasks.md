## 1. Version Embedding

- [x] 1.1 Add `__REMOTE_SERVER_VERSION__` define to `packages/remote/tsup.config.ts`, reading version from `package.json`
- [x] 1.2 Add `version` field to `ServerInfoMessage` in `packages/remote/src/shared/protocol.ts`
- [x] 1.3 Update `_sendServerInfo()` in `packages/remote/src/server/server.ts` to include `version: __REMOTE_SERVER_VERSION__`

## 2. Update Protocol Messages

- [x] 2.1 Add `UpdateOfferMessage` (client→server: version, size, checksum) to `protocol.ts`
- [x] 2.2 Add `UpdateAcceptMessage` (server→client) and `UpdateRejectMessage` (server→client: reason) to `protocol.ts`
- [x] 2.3 Add `UpdateChunkMessage` (client→server: sequence, data as Buffer) to `protocol.ts`
- [x] 2.4 Add `UpdateCompleteMessage` (client→server) to `protocol.ts`
- [x] 2.5 Add `UpdateResultMessage` (server→client: success, error?) to `protocol.ts`
- [x] 2.6 Update `ClientMessage` and `ServerMessage` union types to include new message types

## 3. Server-side Update Handler

- [x] 3.1 Add update message handling in `packages/remote/src/server/index.ts` (update_offer → accept/reject)
- [x] 3.2 Implement chunked file reception with buffer accumulation in `index.ts`
- [x] 3.3 Implement checksum validation (SHA-256) of received file in `index.ts`
- [x] 3.4 Implement atomic file replacement (write .tmp → rename) in `index.ts`
- [x] 3.5 Implement self-restart via `child_process.spawn` preserving CLI args in `index.ts`
- [x] 3.6 Add active session check — reject update when hook or stream sessions are active

## 4. Client-side Bundle Inclusion

- [x] 4.1 Configure `electron-builder.yml` in `apps/desktop` to include `coding-bubble-remote-server.js` as `extraResources`
- [x] 4.2 Add build step to copy `packages/remote/dist/coding-bubble-remote-server.js` to desktop resources before packaging

## 5. Client-side Version Detection & Update

- [x] 5.1 Add method to `RemoteManager` to read the bundled remote server file and extract its version
- [x] 5.2 Add version comparison logic after receiving `server_info` — detect mismatch
- [x] 5.3 Implement `sendUpdate()` method in `RemoteManager` — send offer, chunks, complete
- [x] 5.4 Integrate update flow into the connection lifecycle (after auth + server_info)
- [x] 5.5 Handle `update_result` response — log success, handle failure with retry or notify user

## 6. Verification

- [x] 6.1 Build both packages and verify `__REMOTE_SERVER_VERSION__` is correctly embedded
- [x] 6.2 Test version detection: connect client to old server (no version field) → triggers update
- [x] 6.3 Test update flow: transfer → checksum validation → restart → reconnect
- [x] 6.4 Verify desktop app bundles the remote server file correctly
