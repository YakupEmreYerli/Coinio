# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/getcoinio/coinio/security/advisories/new)). Do not open a public issue or discussion.

Include what you found, how to reproduce it and which version or commit you tested. You will get an answer within a week. Once a fix is released, the advisory is published with credit to you unless you prefer otherwise.

## Supported versions

Security fixes go into the latest release and the `latest` image tag. Coinio is a single self-hosted container, so updating means pulling the new image.

## Scope

In scope: the Coinio server and web app in this repository, the Docker image `ghcr.io/getcoinio/coinio`, the install script (`getcoinio/website`), the deploy templates and the Scriptable widget.

Out of scope: the hosting you put in front of Coinio (reverse proxy, Cloudflare Tunnel), third-party services Coinio talks to (Frankfurter, Telegram, favicon services), problems that need an attacker to already hold your password, an API key or shell access to the host, and the browser-only demo at getcoinio.me/demo, which has no server and no real data.

## Measures by design

- **One account per install.** Passwords are hashed with Argon2id; login is rate limited and takes the same time for unknown users.
- **Sessions** use random tokens stored hashed, in `HttpOnly`, `SameSite=Lax` cookies that are marked `Secure` when `COINIO_PUBLIC_URL` is https.
- **API keys** are random 32-byte tokens stored as SHA-256 hashes, with a read-only or full scope.
- **OAuth for MCP clients** only turns on when `COINIO_PUBLIC_URL` is an `https://` address (or localhost); on plain http it stays off. The consent page cannot be framed.
- **Logo fetching is guarded against SSRF.** Only https URLs, the host is resolved and private, loopback and link-local addresses are refused, every redirect is re-checked, and responses are size and time limited.
- **Uploaded and fetched SVG logos** are served with a `default-src 'none'` Content Security Policy, so scripts inside them do not run.
- **Custom HTML cards** run in a sandboxed iframe (`allow-scripts` without `allow-same-origin`), so they cannot read the app's cookies, storage or API.
- **Secrets stay masked:** the Telegram token is never sent back to the browser in full, and it is never logged.
- **No telemetry, no update check.** Outgoing connections are limited to exchange rates, Telegram (when configured) and logo lookups.
- **The container drops root** after fixing the ownership of `/data` and runs as the `node` user.
