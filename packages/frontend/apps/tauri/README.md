# AFFiNE Tauri (experimental macOS port)

A standalone Tauri 2 app using macOS WebKit and the production AFFiNE editor
from this checkout. Node, Electron, the development server, and Docker are
**not required for local editing** once the app is built.

The editor retains AFFiNE's IndexedDB engine in a dedicated WebKit profile.
A separate environment.isTauri flag identifies the app without enabling
Electron IPC or pretending that its SQLite bridge exists. Account and workspace
sync use AFFiNE's existing web services through a fixed-upstream Rust proxy.

Electron's native SQLite bridge, desktop tabs, tray, auto-updates, deep links,
native PDF/recording integrations, and OAuth/magic-link handoffs are not ported.
**Password sign-in** is the initial supported login flow.

## Build

Use the repository's Node 22 and installed Yarn dependencies. From its root:

```sh
PATH="$HOME/.cargo/bin:$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" \
  RUSTUP_TOOLCHAIN=1.97.0 NODE_OPTIONS=--max-old-space-size=6144 \
  packages/frontend/apps/tauri/build.sh
```

RUSTUP_TOOLCHAIN selects an installed compiler without changing the repository's
Rust pin or global default. The shell has its own Cargo workspace and lockfile.
Tauri CLI is pinned to 2.12.1; Yarn's lockfile is unchanged.

Output:

```text
packages/frontend/apps/tauri/src-tauri/target/release/bundle/macos/AFFiNE Tauri.app
```

The local app is ad-hoc signed, not notarized for distribution. It can run beside
the official Electron app. Developer tools remain enabled. After Rust-only edits,
run this from packages/frontend/apps/tauri to reuse the web build:

```sh
RUSTUP_TOOLCHAIN=1.97.0 npx --yes --package @tauri-apps/cli@2.12.1 tauri build --bundles app
```

Closing the main window (red close button or Cmd-W) quits this single-window app.
Dock relaunch opens the same stored workspace. Standard macOS Edit commands
provide undo/redo, cut/copy/paste and select-all. Exports use a native save dialog;
rfd runs NSSavePanel's modal loop directly on the main thread.

## Data and backups

App identifier: com.mattpetters.affine-tauri.
Storage origin: http://127.0.0.1:47861.
WebKit data-store UUID: 8F2184A6-1D46-4393-8A61-C5E87F020001.

The profile on this Mac is under:

```text
~/Library/WebKit/com.mattpetters.affine-tauri/WebsiteDataStore/8f2184a6-1d46-4393-8a61-c5e87f020001/
```

**Keep the origin, identifier, and UUID stable across updates.** Do not clear the
profile or reset these values to fix startup issues. Quit the app before copying
its complete profile for a consistent backup. Export important notes as well:
this profile is WebKit-managed data, not a portable Markdown folder. Browser and
Electron profiles remain separate and are never imported or modified automatically.

The app requests navigator.storage.persist() and records the actual result.
A persistent WKWebsiteDataStore survives application restarts; it does not itself
prove that WebKit granted protection from storage-pressure eviction. The local
workspace banner identifies Tauri and says sync is disabled. If persistence is
denied, it also explains possible storage reclamation. Granted/unknown results
never imply that sync or a backup exists. See
[WebKit's storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

## Local server and sign-in

The default upstream is http://127.0.0.1:3010, provided by the existing Compose
installation:

```sh
docker compose -f "$HOME/code/affine-local/compose.yml" up -d
```

Create the server administrator account through http://127.0.0.1:3010 first.
Then in Tauri:

1. Choose **Sign in and Enable**, enter that account's email, and continue to the
   password form. The local server is detected automatically; no server-URL entry
   step is required.
2. After sign-in, choose **Enable AFFiNE Sync / Enable AFFiNE Cloud** for the
   desired workspace and confirm. Signing in alone does not synchronize notes.
3. Verify the workspace in the server's browser UI, edit a test note both ways,
   and test offline/reconnect before relying on sync for important work.

Existing local notes and storage identity remain in place until the user invokes
AFFiNE's normal workspace upload/conversion workflow. Keep a profile/export backup
before enabling sync on a workspace containing important notes.

The app embeds its assets and serves them from its own loopback-only async Rust
server. Only /api/_, /graphql, and /socket.io/_ go to the configured upstream.
Uploads/downloads stream, and WebSockets use asynchronous bidirectional relay.
Upstream failure returns an API error while bundled local editing remains available.

For the local HTTP upstream, the server.hosts allowlist includes 127.0.0.1:47861.
The proxy preserves real Origin, Referer, auth cookies, and CSRF tokens. It rejects
foreign/duplicate Host and Origin headers, cross-site fetches, path traversal,
and unverified mutation requests. No arbitrary filesystem paths, proxy destinations,
or native IPC capabilities are exposed. External links open in the system browser.

When using a **canary server image**, set `AFFINE_ENV=dev` on the server while
keeping `NODE_ENV=production` and `DEPLOYMENT_TYPE=selfhosted`. Here `dev` selects
the canary release namespace; it does not enable Node development mode. Without
it, the server's own browser client can sign in but receive “The server rejected
the real-time request” because its date-style canary version is rejected by the
realtime version gate. The Tauri build uses the checkout's semantic version and
may still upload successfully, so a successful Tauri upload alone does not verify
that the server's browser client can read or sync the workspace. Use the matching
release namespace for stable images instead of carrying this setting over blindly.

## Changing the upstream later

On launch the app reads this optional configuration file:

```text
~/Library/Application Support/com.mattpetters.affine-tauri/server.json
```

```json
{ "url": "http://127.0.0.1:3010" }
```

AFFINE_TAURI_SERVER_URL overrides the file for a terminal-launched process. Only
root HTTPS URLs or loopback HTTP URLs are accepted. Credentials embedded in URLs,
paths, queries, fragments, and the app's own origin are rejected. Changes take
effect on the next normal launch. Never change the local storage origin.

For an HTTPS server, the proxy validates incoming app-origin requests
**before** mapping Origin/Referer to the fixed upstream's HTTPS origin. TLS uses
the standard public root certificates. This preserves the official server's
same-origin policy without requiring a backend fork or a broad CORS exception.
Upstream redirects are returned rather than followed with credentials.

Cookies are scoped to the dedicated local WebKit profile: upstream Domain/Secure
attributes are removed at the TLS-to-loopback boundary, while HttpOnly, expiry,
path, and SameSite restrictions remain. SameSite=None becomes Lax. AFFiNE's current
cookies are unprefixed; __Host- and __Secure- cookie names are not supported.
This does not grant remote pages native IPC or share cookies with other browsers.

Before a Railway cutover, back up and restore the same server database, blob
storage, and configuration, then verify the migrated server before changing this
file. Pointing this profile at an unrelated empty server is not a migration.
The development installation has completed this migration to a Railway HTTPS
server; the default configuration above remains a local-server example.

## Validation

From this folder:

```sh
RUSTUP_TOOLCHAIN=1.97.0 MACOSX_DEPLOYMENT_TARGET=14.0 cargo test --manifest-path src-tauri/Cargo.toml
node --test bootstrap.test.mjs
```

Focused tests cover auth/CSRF/cookies, streamed bodies, WebSocket handshakes and
frames, upstream errors, offline assets, URL/path restrictions, HTTPS-origin
mapping, and actual persistence-result reporting. Transport tests do not replace
signing in and checking workspace sync, persistence after relaunch, or Markdown
export through the native dialog. Performance must be measured: a smaller runtime
alone does not guarantee faster editing.

On the development Mac, the installed build reopened the existing workspace and
notes after a clean quit and update. The corrected Tauri banner rendered, the
proxied session endpoint and Socket.IO handshake responded, and a foreign origin
was rejected. WebKit returned false for the persistence request on this macOS
beta, so the app correctly retained the storage-reclamation warning. Native
Markdown export still needs an interactive check. Password sign-in and enabling
sync uploaded a workspace, document snapshots, and attachments to the local
server. After restoring that server to Railway and changing the upstream, the
existing authenticated session, GraphQL requests, attachments, and authenticated
realtime connection worked over HTTPS. Subsequent edits persisted on the migrated
server with signups disabled. The loopback origin and local profile were preserved.
Offline/reconnect behavior and complete cross-client editing still need dedicated
interactive checks.

The Journals redirect regression test reproduces a stale browser navigation
overwriting the selected journal, and covers the fix with browser Back/Forward
and independent browser navigation. Its first installed-build check is pending.
