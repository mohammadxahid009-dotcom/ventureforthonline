# Expedition background imagery

## What will change
- Add a cohesive set of atmospheric outdoor expedition images for the sign-in, home/base, multiplayer lobby, crew, and password-reset screens.
- Keep the live hunt map unchanged so its map and fog remain the primary visual experience.
- Layer dark, readable overlays over each image so every label, form, and button stays clear.
- Preserve the existing field-instrument style, amber accents, controls, and all current behavior.

## Technical details
- Generate optimized portrait-friendly bitmap backgrounds and store them with the app.
- Reuse shared background treatment styles to avoid duplicated visual code and unnecessary page weight.
- Apply route-specific image positioning for mobile and desktop.
- Verify the screens at mobile and desktop sizes, then check the app for build or runtime errors.
