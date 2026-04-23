# MoM App — Cowork Build Prompt

> Copy and paste everything below this line into Cowork to build the app.

---

## Build a single-file MoM (Minutes of Meeting) web app

Create a single `index.html` file with embedded CSS and JavaScript. No frameworks, no build step, no backend. Runs directly in the browser.

---

## Layout — sidebar + document workspace

```
┌─────────────────┬──────────────────────────────────────┐
│   LEFT SIDEBAR  │         RIGHT EDITOR PANEL           │
│                 │                                      │
│  [+ New MoM]    │  Meeting Title                       │
│                 │  Date & Time   Attendees             │
│  🔍 Search      │  PDF / Copy for Email / Plain Text   │
│ [All|Follow|Task]                                      │
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

- Left sidebar: fixed desktop width ~290px, scrollable meeting list, search box at top, list-mode toggle under search, Export/Import/Theme/Help at bottom
- Right panel: the active MoM editor as a document-style workspace, scrollable
- Responsive: on mobile, sidebar collapses and editor takes full width

---

## MoM Editor fields

1. `Meeting Title` — text input, large, prominent at top
2. `Date` — custom date picker, auto-filled to today
3. `Time` — custom time picker, auto-filled to current time
4. `Attendees` — single text input, comma-separated names
5. `Discussion Notes` — large textarea, min 6 rows, grows with content
6. `Action Items` — dynamic rows, each row has: Complete checkbox + Task (text) + Owner (text) + Due Date (custom date picker) + Delete button. A `+ Add Action Item` button appends a new empty row
7. `Next Follow-up` — custom date picker
8. `Follow-up Notes` — small textarea, 2 rows

---

## Auto-save

Save to localStorage on every keystroke / change event. Never show a manual save button. Show a subtle `Saved` indicator (fades out after 2 seconds) in the top right of the editor.

---

## Sidebar list modes

The sidebar supports three modes:

1. `All Meetings`
   - Shows all meeting records
   - Each item shows title, date/time, and discussion preview

2. `Follow-ups`
   - Shows only meetings with `nextFollowUp`
   - Sorted by follow-up date ascending
   - Grouped into `Overdue`, `Today`, and `Upcoming`
   - Each item shows title, follow-up date, and optional follow-up notes preview

3. `Tasks`
   - Shows only meetings with at least one incomplete action item
   - Loads a main-panel task dashboard rather than using the sidebar as the primary display
   - Groups action items by meeting title
   - Sorts tasks by urgency: `Overdue`, `Today`, `Upcoming`, then `No due date`
   - Shows active task text, owner, due date, and a task status badge
   - Shows the meeting's `Next Follow-up Date` once per meeting group when set

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
- Matches against title, attendees, discussion notes, and follow-up notes
- In `Tasks` mode, search also matches task text and task owner
- No results state: show `No meetings found`
- In follow-up mode with no dated items, show `No follow-ups scheduled`

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

## PDF / Copy actions

- Add toolbar actions at the top of the editor:
  - `PDF` — opens browser print flow using a print-friendly document layout
  - `Copy for Email` — copies rich HTML suitable for Gmail or Outlook
  - `Plain Text` — copies a plain text meeting summary

---

## Action item completion

- Each action item has a checkbox to mark it complete
- Completed items remain visible for meeting history
- Completed items should appear visually dimmed / struck through
- Completed items should not need to be deleted just to show they are done

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
    { "task": "Update firewall rules", "owner": "Prabu", "due": "2026-04-15", "completed": false }
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
| `mom_list_mode` | Current sidebar list mode |

---

## Themes — 2 options

1. `Word` — default theme, inspired by Microsoft Word with a white document page, quiet gray chrome, and Office-style blue accents
2. `Dark` — true dark workspace variant with near-black backgrounds, white text, and restrained monochrome accents that are easy on the eyes

Theme toggle button in sidebar bottom. Cycles through the 2 themes. Saved to localStorage.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | New MoM (when not typing in a field) |
| `Esc` | Deselect / close any overlay |
| `Cmd/Ctrl + F` | Focus search box |
| `D` | Download / export JSON (when not typing) |

Show a `Help` button in the sidebar that opens a shortcuts overlay.

---

## Empty state

When no MoM exists or none is selected, show a centered message in the editor panel:

> `Select a meeting from the list or create a new one with + New MoM`

---

## Design principles

- Main theme direction: document workspace with polished modern chrome
- Default feeling should be familiar to office users, especially in the `Word` theme
- Keep the editor readable and page-like rather than full-width edge-to-edge
- Use subtle shadows, practical borders, and strong readability
- Preserve the custom sidebar and follow-up workflow
- Active items and focus states should stay clear, but the dark theme should rely on white/light contrast instead of bright blue emphasis
- Mobile: sidebar hidden by default, hamburger menu reveals it

---

## Constraints

- No external dependencies
- Pure HTML + CSS + JavaScript in one file
- Must work offline by opening `index.html` directly in a browser
- No frameworks (no React, Vue, Angular)
- No CDN links required
