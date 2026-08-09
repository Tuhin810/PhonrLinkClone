# Phase 8.5 — Screen Mirroring & Remote Control

## Goal
A phone-shaped window on the Mac showing the live Android screen, which you can tap, swipe and
type into — the headline Phone Link feature.

Built in two independently testable steps.

## Step 1 — View-only mirroring
- Android: `MediaProjection` + `ImageReader`, scaled down, JPEG-encoded, streamed as
  `screen_frame` envelopes. Capture runs inside a foreground service with type
  `mediaProjection` (mandatory from Android 10).
- Mac: a separate phone-shaped `BrowserWindow` rendering frames into a `<canvas>`, with
  start/stop controls.

**Why JPEG frames, not H.264:** MediaCodec + a decoder on the Mac is materially more work and
adds a hard dependency on a video pipeline in Electron. Scaled JPEG at a modest frame rate is
usable for the "check a notification, tap a reply" workflow this is for, and the protocol can
carry encoded video later without changing shape.

**Exit check:** the Mac window shows the phone's screen updating live; stopping capture on
either side leaves both in a clean state.

## Step 2 — Remote input
- Android: an `AccessibilityService` (`dispatchGesture` for taps and swipes, `performGlobalAction`
  for back/home/recents). This is the only route for a normal app — `INJECT_EVENTS` is
  system-only, which is why scrcpy runs a helper over adb instead.
- Mac: mouse and keyboard events on the canvas mapped to **normalised 0..1 coordinates**, so the
  two devices never need to agree on resolution.

**Exit check:** clicking the Mac window taps the corresponding place on the phone; back/home
work; typed text appears in a focused field.

## Known limits to state plainly
- **Accessibility permission is required for input** and must be granted by hand. Without it,
  mirroring still works read-only.
- **Some screens refuse to be captured** — `FLAG_SECURE` windows (banking apps, DRM video) show
  black. Not fixable, and not a bug.
- **Frame rate is modest.** This is for glanceable use, not gaming.
- **Text entry goes through gestures/accessibility**, so an IME with unusual behaviour may not
  receive it perfectly.
