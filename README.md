# BYD Press Fleet

Web app for the PR press-car pool, laid out like the original Excel calendar.

- **Calendar** (main screen): yellow Gantt, one row per car: *Model · Colour* over *VIN · Plate*. Press cars first, then company cars (long-term, grey), then unregistered cars.
  - Click or drag across empty days to reserve exactly those dates.
  - Click a yellow block: extend / shorten the return date, move the whole booking a day, **swap / change car**, edit, cancel.
  - **Swap cars**: give a booking another car; if that car is busy with one booking that fits on the first car, the two bookings swap cars in one step.
  - **List** view with filters and Excel export; the timeline also exports as an Excel grid.
- **Quick reserve** (yellow button, always visible): model + number of days + client name → every free car, earliest first, one click to reserve. Copy text for WeCom chat, Excel per model or for all models.
- **Cars**: fleet list, team access, models. Each car's window has **Change plate** and **Swap plates with another car**.

## Data rules

- A car's permanent identity is its **VIN**. The plate is an attribute with a history (`plate_history`), so plate changes and plate swaps never touch bookings, and searching an old plate still finds the car.
- Double bookings are impossible: the database rejects overlapping non-cancelled bookings of the same car (also during swaps).
- Only signed-in users whose email is in `fleet_members` can read or write (row-level security).

## Adding a colleague

1. Cars page → Team access: add their email.
2. Supabase dashboard → Authentication → Users → Add user → Create new user (same email, temporary password, Auto Confirm User).
3. Send them the link and the temporary password; they can change it from the menu at the top right.

## Local preview

`python -m http.server 8765` in this folder, then open `http://localhost:8765/`.
`?demo` runs on an in-memory copy of `demo-data.json` (not committed).
