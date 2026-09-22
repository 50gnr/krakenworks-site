# krakenworks-site
Public website and privacy policy for Krakenworks

## Post-launch backlog

### Dungeon Inc. download page

- The page expects the stable APK at
  `downloads/DungeonInc-Defence-0.2.19.apk`.
- Promote a newer build only after its release notes and phone QA identify it as
  the stable playtest build; do not publish `*-Tester.apk` as the main download.

### Rules Bot live-beta page

- Add a simple question box for live D&D/rules testing after the main site is published.
- Show the concise answer, cited sources, and a clear fallback when the bot cannot answer safely.
- Add a small **Report a bad answer / QA issue** form tied to the displayed response.
- Consider opt-in audit logging for questions, answers, citation IDs, latency, and user feedback.
- Keep logs privacy-minimal: do not collect names by default, do not retain private rulebook text,
  publish a retention/deletion policy, and make telemetry consent clear.
- Add basic abuse protection, rate limits, and an operator kill switch before sharing publicly.
- Decide the execution backend before implementation. GitHub Pages can host the interface but
  cannot run the Rules Bot Node process; the page will need a small hosted API or a securely
  exposed user-owned machine.

The static interface is now present under `rules-bot/`. To connect it, set the
`rules-bot-api` meta tag in `rules-bot/index.html` to the final HTTPS endpoint.
For local-only testing, serve this repository with `python3 -m http.server 8080 --bind 127.0.0.1`, start the Rules Lawyer adapter with `npm run serve:beta`, and temporarily set the meta value to `http://127.0.0.1:8787/v1/ask`. Never commit that local URL as a production endpoint.

The browser sends `POST { "question": string, "system": "dnd-2024", "telemetryConsent": boolean }` and expects
`{ "kind": "answer" | "clarification" | "evidence" | "unresolved",
"text": string, "citations": [{ "quote": string, "source": string }] }`.
Keep the endpoint blank until authentication/CORS, abuse limits, privacy-minimal
logging, an operator kill switch, and the Rules Lawyer release gates are complete. Consent is off by default. A consented response can be reported through the derived `/v1/feedback` endpoint using its response ID; the UI collects no free-text feedback or identity.
