# My Space PRO — v5 Cloud Sync Edition

## What's New (vs v4)

### ✅ Per-User Storage Files
Each user gets their own isolated data file:
- `user1` → stored under key `user:user1@email.com`
- `user2` → stored under key `user:user2@email.com`  
- `user3` → stored under key `user:user3@email.com`

No user can see another user's data.

### ✅ Real-Time Cloud Sync
- Every save (category, link, note, profile) is written to cloud storage **instantly**
- The sync indicator in the sidebar shows: `Syncing… → Synced ✓`
- The topbar pill shows sync status at all times

### ✅ Multi-Device Login
1. Create your account on your PC → your data is saved to the cloud
2. Open the app on your phone → log in with the same email + password
3. **Your data appears automatically** — categories, links, notes, everything

### ✅ Separate Export Files
When you export, the file is named after YOU:
- Alex Demo → `alex_demo.json`
- John Smith → `john_smith.json`
- Not one shared `data.json` anymore

## How the Storage Works

```
Registration:
  email + password → saved to "users:registry"
  user data        → saved to "user:your@email.com"

Login (any device):
  1. Check "users:registry" for email + password match
  2. Load "user:your@email.com" from cloud
  3. All your data appears instantly

Every Save:
  categories/notes/links → write to "user:your@email.com"
  ↳ Synced across all devices on next login
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | App structure + all modals |
| `style.css`  | All styles including cloud sync UI |
| `app.js`     | Full app logic + cloud sync engine |

## Running the App

Simply open `index.html` in a browser. No server needed.

**For full cloud sync** (multi-device): the app must run inside the Claude artifact environment which provides `window.storage`. Outside of it, it automatically falls back to `localStorage` (single-device mode).

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Focus search |
| `Ctrl/Cmd + E` | Export my data |
| `Escape` | Close any modal |
