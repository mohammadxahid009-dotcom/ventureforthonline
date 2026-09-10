# Flag button feedback fix

## What's happening
The greyed-out flag button on the right side of the map is "Show the whole route" — when tapped, it zooms the map out so both you and the destination X fit on screen. It is intentionally disabled (and dimmed) until you have physically walked close enough to reveal the destination, so tapping it now does nothing and gives no explanation.

## Changes
1. Keep the flag button tappable at all times, but while the destination is still hidden:
   - Show a short toast message explaining it unlocks once you get close enough to reveal the destination marker.
   - Keep the dimmed flag icon so its locked state stays visible.
2. Once the destination is revealed, the button works as before: one tap zooms out to show you and the destination together.

## Technical details
- Edit `src/routes/index.tsx` only: remove the `disabled={!destVisible}` on the flag button, keep the dimmed styling when locked, and fire a `sonner` toast (e.g. "Destination not revealed yet — keep walking to uncover it") when tapped while `destVisible` is false.
- No changes to fog, GPS, coordinates, or gameplay logic. No performance impact.
