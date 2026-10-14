# Ruth's Car Pool

A carpool management app that runs in any web browser and installs on iPhone like a regular app (no App Store needed). Hosted free on GitHub Pages.

## Features
- **Schedule** — today's routes, check off who rode, one-tap navigation and "On my way" group text
- **Riders** — name, parent/payer, phone, email, pickup address, rate (monthly per person by default; weekly or per-ride also supported)
- **Routes & alarms** — separate drop-off and pickup runs, pickup order, days, usual time plus different times on certain days (e.g. early Friday pickup); multi-stop Google Maps directions. "Set all alarms" adds every run to the iPhone Calendar with alerts, so they ring even when the app is closed
- **School calendar** — days off, breaks and early-dismissal dates. The week strip marks no-carpool days; alarms skip days off and use the early pickup time on half days
- **Live tracking for parents** — "Start run · share live" shares Ruth's location during a run. Each family gets a private link (Riders → Text parent link) showing a live map, arrival time ("5 min · 1 stop before you"), the upcoming schedule, an "Add to my calendar" button, and a "Not riding?" button that reports absences straight to Ruth's app
- **Automatic alerts** — through the free ntfy app: 30 minutes before each carpool, "on the way", "5 minutes away", "picked up", "dropped off at school/home"
- **Billing** — one tap to invoice all riders for the month, text or email the invoice with Zelle/Venmo payment instructions, mark paid (Zelle, cash, Venmo, check), outstanding/overdue totals, next bill date
- **Backup** — export/import all data as a file

## Install on iPhone
1. Open the app link in **Safari**
2. Tap **Share** → **Add to Home Screen**

## Notes
- Data is saved on the device that uses it. Live tracking, schedule updates for parents and absence reports pass through the free ntfy.sh relay, end-to-end encrypted (AES-GCM) with a key that exists only in the private parent links. Push alert texts (e.g. "Leah was picked up at 7:41") are short plain text. Maps: OpenStreetMap; arrival times: OSRM; address lookup: Nominatim.
- iPhone only shares location from a web app while it is open on screen, so keep the app open in a phone mount during a run. Use Settings → Export backup to move it to another device.
- Zelle has no public API for small businesses, so the app puts your Zelle email/phone on each invoice and you mark it paid when the money arrives.
