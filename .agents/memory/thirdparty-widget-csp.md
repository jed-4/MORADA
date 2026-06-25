---
name: Third-party widget CSP
description: Adding any embedded third-party JS widget requires CSP whitelisting in server/index.ts
---
BuildPro sets a strict Content-Security-Policy as a manual header in `server/index.ts`
(default-src 'self'; explicit script/style/img/font/connect/frame/object directives).
It is NOT helmet defaults and NOT permissive.

**Rule:** Any embedded third-party SaaS widget (Crisp, Intercom, analytics, etc.) must have
its origins added to the relevant directives or the browser silently blocks it (no JS error,
just "Refused to load…" console messages and a widget that never appears).

**Why:** Crisp loads a script from client.crisp.chat, pulls styles/images/fonts from the same
host (+ image.crisp.chat), opens a websocket to wss://client.relay.crisp.chat, and renders its
chat UI in an iframe — so it needs script-src, style-src, img-src, font-src, connect-src AND
frame-src entries. Missing frame-src alone makes the bubble load but the chat panel fail to open.

**How to apply:** When integrating a new widget, check its required domains and add them across
ALL relevant CSP directives in server/index.ts, then restart the workflow (the header is set at
boot). Pre-existing "Refused to load" messages for Google Fonts and the Replit dev banner are
expected/unrelated noise.
