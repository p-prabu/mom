# MoM

MoM is a lightweight Minutes of Meeting web app built with plain HTML, CSS, and JavaScript. It runs directly in the browser with no backend, no build step, and no external dependencies.

## Features

- Create and manage meeting records from a sidebar list
- Edit meeting title, date, time, attendees, discussion notes, and follow-up notes
- Add and remove action items with task, owner, and due date
- Auto-save all changes to `localStorage`
- Search meetings by title, attendees, or discussion notes
- Export all meeting records as JSON
- Import meeting records from JSON with preview and merge behavior
- Delete meetings with undo support
- Switch between `soft`, `light`, and `dark` themes
- Use keyboard shortcuts for common actions
- Responsive layout with a collapsible sidebar on mobile
- Custom date and time pickers in the browser UI

## Project Files

- `index.html`: app layout and UI structure
- `styles.css`: theme styles, layout, and responsive design
- `app.js`: application state, localStorage persistence, editor logic, search, import/export, and UI interactions
- `MoM_App_Build_Prompt.md`: original build/spec prompt for the app

## How It Works

The app stores all meeting records locally in the browser using these `localStorage` keys:

- `mom_records`
- `mom_theme`
- `mom_active_id`

This means the app works offline and does not require a server.

## Run Locally

Open [index.html](/Users/prabuponnan/Documents/Claude/mom/index.html) directly in a browser.

No installation steps are required.

## Data Model

Each meeting record includes:

- `id`
- `title`
- `date`
- `time`
- `attendees`
- `discussion`
- `actions`
- `nextFollowUp`
- `followUpNotes`
- `createdAt`
- `updatedAt`

## Keyboard Shortcuts

- `N`: create a new meeting
- `Esc`: close overlays or dismiss active UI states
- `Cmd/Ctrl + F`: focus search
- `D`: export meeting records

## Notes

- Data is stored per browser on the local machine
- Import/export is the current backup and transfer mechanism
- The app is intentionally framework-free and simple to open, edit, and extend
