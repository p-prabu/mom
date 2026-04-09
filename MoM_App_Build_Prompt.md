# MoM App — Cowork Build Prompt

> Copy and paste everything below this line into Cowork to build the app.

---

## Build a single-file MoM (Minutes of Meeting) web app

Create a single `index.html` file with embedded CSS and JavaScript. No frameworks, no build step, no backend. Runs directly in the browser.

---

## Layout — 3 panel design (inspired by Apple Notes / Mind Journal)

```
┌─────────────────┬──────────────────────────────────────┐
│   LEFT SIDEBAR  │         RIGHT EDITOR PANEL           │
│                 │                                      │
│  [+ New MoM]    │  Meeting Title                       │
│                 │  Date & Time   Attendees             │
│  🔍 Search      │                                      │
│                 │  Discussion Notes (big textarea)     │
│  ─────────────  │                                      │
│  Apr 9 · Sprint │  Action Items                        │
│  Apr 8 · Design │  [ Task | Owner | Due | ✕ ]         │
│  Apr 7 · Infra  │  [+ Add Action]                      │
│                 │                                      │
│  [Export JSON]  │  Next Follow-up Date & Notes         │
│  [Import JSON]  │                                      │
│  [Theme]        │  [🗑 Delete MoM]                     │
└─────────────────┴──────────────────────────────────────┘
```

- Left sidebar: fixed width ~260px, scrollable MoM list, search box at top, Export/Import/Theme at bottom
- Right panel: the active MoM editor, scrollable
- Responsive: on mobile, sidebar collapses and editor takes full width

---

## MoM Editor fields

1. `Meeting Title` — text input, large, prominent at top
2. `Date` — date input, auto-filled to today
3. `Time` — time input, auto-filled to current time
4. `Attendees` — single text input, comma-separated names
5. `Discussion Notes` — large textarea, min 6 rows, grows with content
6. `Action Items` — dynamic rows, each row has: Task (text) + Owner (text) + Due Date (date) + Delete button. A `+ Add Action Item` button appends a new empty row
7. `Next Follow-up` — date input
8. `Follow-up Notes` — small textarea, 2 rows

---

## Auto-save

Save to localStorage on every keystroke / change event. Never show a manual save button. Show a subtle `Saved` indicator (fades out after 2 seconds) in the top right of the editor.

---

## MoM list in sidebar

Each item shows:
- Meeting title (bold)
- Date + time (muted, small)
- First 60 characters of discussion notes (muted preview)

Clicking an item loads it into the editor. Active item is highlighted.

---

## New MoM

`+ New MoM` button creates a blank MoM with today's date and current time pre-filled, adds it to the top of the list, and opens it in the editor immediately.

---

## Delete MoM

- Delete button at the bottom of the editor
- Show a confirmation dialog before deleting
- After delete, show an undo banner for 5 seconds at the bottom of the screen
- If undo is clicked within 5 seconds, restore the MoM

---

## Search

- Search box in sidebar filters the list in real time
- Matches against title, attendees, discussion notes
- No results state: show `No meetings found`

---

## Export JSON

- Exports all MoMs as a JSON file
- Filename: `mom-records-YYYY-MM-DD.json`
- Format: array of MoM objects

---

## Import JSON

- File picker accepts `.json` files
- Show a review step: `Found X meetings. Y new, Z will replace existing.`
- Confirm button applies the import
- Merge by `id` — new records added, existing records replaced

---

## Data structure per MoM

```json
{
  "id": "uuid-v4",
  "title": "Sprint Planning Week 15",
  "date": "2026-04-09",
  "time": "10:00",
  "attendees": "Prabu, Anna, Marcus",
  "discussion": "Reviewed last sprint velocity...",
  "actions": [
    { "task": "Update firewall rules", "owner": "Prabu", "due": "2026-04-15" }
  ],
  "nextFollowUp": "2026-04-16",
  "followUpNotes": "Check with team on blocker",
  "createdAt": "2026-04-09T10:00:00Z",
  "updatedAt": "2026-04-09T10:45:00Z"
}
```

---

## localStorage keys

| Key | Purpose |
|---|---|
| `mom_records` | Array of all MoM objects |
| `mom_theme` | Active theme name |
| `mom_active_id` | Last opened MoM id |

---

## Themes — 3 options

1. `Light` — white sidebar, white editor, dark text
2. `Dark` — dark gray sidebar (`#1e1e2e`), darker editor (`#13131f`), light text
3. `Soft Gray` — default, warm off-white (`#f5f4f0`), muted tones, easy on eyes

Theme toggle button in sidebar bottom. Cycles through the 3 themes. Saved to localStorage.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | New MoM (when not typing in a field) |
| `Esc` | Deselect / close any overlay |
| `Cmd/Ctrl + F` | Focus search box |
| `D` | Download / export JSON (when not typing) |

Show a `?` help button in the sidebar that shows a shortcuts overlay.

---

## Empty state

When no MoM exists or none is selected, show a centered message in the editor panel:

> `Select a meeting from the list or create a new one with + New MoM`

---

## Design principles

- Flat, minimal, calm — Apple Notes / Notion feel
- No gradients, no heavy shadows
- Font: `system-ui` or `-apple-system`
- Sidebar background slightly darker than editor
- Active MoM in list: left border accent (blue), subtle background highlight
- Action item rows: clean table-like layout with thin borders
- All inputs: borderless or minimal border, focus ring only on active
- Spacing: generous padding, breathable layout
- Mobile: sidebar hidden by default, hamburger menu reveals it

---

## Constraints

- No external dependencies
- Pure HTML + CSS + JavaScript in one file
- Must work offline by opening `index.html` directly in a browser
- No frameworks (no React, Vue, Angular)
- No CDN links required
