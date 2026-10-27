# BYD Press Fleet

Web app for the PR press-car pool, laid out like the original Excel calendar.

- **Calendar** (main screen): yellow Gantt, one row per car: *Model · Colour* over *VIN · Plate*. Press cars first, then company cars (long-term, grey), then unregistered cars.
  - Click or drag across empty days to reserve exactly those dates.
  - Click a yellow block: extend / shorten the return date, move the whole booking a day, **swap / change car**, edit, cancel.
  - **Swap cars**: give a booking another car; if that car is busy with one booking that fits on the first car, the two bookings swap cars in one step.
  - **List** view with filters and Excel export; the timeline also exports as an Excel grid.
- **Quick reserve** (yellow button, always visible): model + number of days + client name → every free car, earliest first, one click to reserve. Copy text for WeCom chat, Excel per model or for all models.
- **Cars**: every car with category, plate, VIN, description and where it is today. Add cars here or from the calendar. Each car's window has a **description** box, **Change plate**, **Swap plates** and the car's history.
- **History**: every change (bookings, cars, plates, team, settings) with who, when and old → new values. Append-only: nobody can edit or delete it.
- **Settings**: team (admins add people with a temporary password, reset passwords), your own **car categories** (calendar sections, which ones can be reserved), **booking types** with colours, models.

## Data rules

- A car's permanent identity is its **VIN**. The plate is an attribute with a history (`plate_history`), so plate changes and plate swaps never touch bookings, and searching an old plate still finds the car.
- Double bookings are impossible: the database rejects overlapping non-cancelled bookings of the same car (also during swaps).
- Only signed-in users whose email is in `fleet_members` can read or write (row-level security).

## Adding a colleague

Settings → Team → name, email, role and a temporary password → **Add person**. Send them the link and the password; they can change it from the menu at the top right. (The login is created by the `manage-members` Supabase Edge Function, which only admins can call.)

## Local preview

`python -m http.server 8765` in this folder, then open `http://localhost:8765/`.
`?demo` runs on an in-memory copy of `demo-data.json` (not committed).
