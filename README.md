# LoL Item Coach

![LoL Item Coach icon](build/icon.png)

This is an Electron desktop assistant for League of Legends. It reads Riot's local Live Client API on `https://127.0.0.1:2999/liveclientdata/allgamedata`, then ranks item options from:

- a Mobalytics build-page candidate pool for the active champion
- current enemy damage split by threat
- the most fed enemy right now
- your current item state and how close you are to finishing an item

The UI links the external build page it is using for candidate sourcing:

- Mobalytics champion build page

## Desktop app

1. Open PowerShell in the repository root directory
2. Install dependencies:

```powershell
npm.cmd install
```

3. Run the Electron app:

```powershell
node_modules\\.bin\\electron.cmd .
```

The app opens a desktop window and registers itself to launch at Windows sign-in. This is intentionally done with Windows startup registration, not a classic Windows Service, because Services cannot reliably show an interactive Electron UI in the user's desktop session.

## Web debug mode

If you want the original browser version for debugging:

```powershell
node server.js
```

## Notes

- If League is not currently in game, the app minimizes itself.
- When a game becomes active, the app restores and focuses itself once.
- Static Riot patch data is cached in `.cache` after the first run.
- The app enables Windows startup when it launches.

## Current scoring model

`score = provider-pool fit + live-counter-fit + fed-threat bonus + build-path bonus + affordability`

The candidate pool is now provider-constrained:

- low-signal early game: Mobalytics core/full build items
- live reactive states: Mobalytics situational items

The scoring inside that pool is still heuristic and uses live threat, damage mix, gold, and owned components to rank the next best option.

## Packaging

Build an MSI on Windows with:

```powershell
npm.cmd run dist
```

