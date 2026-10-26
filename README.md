# BYD Press Fleet

Web app for the PR press-car pool: find a free car for N days, book it, see everything on a calendar.

- **Find a car**: pick a model and the number of days; every Active car is checked against all bookings and the earliest free dates are listed. One click to book, copy the text for WeCom chat, or export to Excel (per model or all models).
- **Calendar**: timeline of all cars, coloured by purpose. Click an empty day to book, a bar to edit.
- **Bookings**: searchable list, cancel instead of delete, Excel export.
- **Fleet**: cars, plates, VINs, status (only Active cars are offered for booking).
- **Team**: who has access (admins only).

Double bookings are impossible: the database rejects any two non-cancelled bookings of the same car on overlapping days.

## How it works

Static site (`index.html`, `styles.css`, `app.js`, `config.js`) hosted on GitHub Pages, data in Supabase (project `byd-press-fleet`).
Only signed-in users whose email is in the `fleet_members` table can read or write (row-level security).

## Adding a colleague

1. In the app, Team tab: add their email.
2. Supabase dashboard → Authentication → Users → Add user → Create new user (same email, temporary password, Auto Confirm User).
3. Send them the link and the temporary password; they can change it from the menu at the top right.

## Local preview

`python -m http.server 8765` in this folder, then open `http://localhost:8765/`.
`?demo` runs on an in-memory copy of `demo-data.json` (not committed).
