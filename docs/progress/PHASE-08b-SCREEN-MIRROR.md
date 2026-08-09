# Phase 8.5 — Screen Mirroring & Remote Control — COMPLETE (input needs a manual grant)

**Completed:** 2026-08-09

A phone-shaped window on the Mac showing the live Android screen, clickable and swipeable.

## What was built
Protocol (v4):
- `screen_control` (Mac -> phone start/stop), `screen_frame`, `screen_state`, and
  `input_tap` / `input_swipe` / `input_key` / `input_text`.
- **Input coordinates are normalised 0..1** and validated as such, so the two devices never have
  to agree on resolution, scaling or rotation.

Android:
- `ScreenCaptureService.kt` — `MediaProjection` + `ImageReader` into a foreground service typed
  `mediaProjection` (mandatory from Android 10). Frames are downscaled to a 720px longest edge,
  JPEG q55, throttled to ~8fps. Row-stride padding is cropped rather than transmitted.
- `RemoteInputService.kt` — an `AccessibilityService` using `dispatchGesture` for taps and
  swipes and `performGlobalAction` for back/home/recents.
- `ScreenCaptureModule.kt` — consent flow, capture control, input dispatch, screen size.

Mac:
- A separate phone-shaped `BrowserWindow` (`mirror.html`) drawing frames to a canvas, with
  back/home/recents buttons. Kept separate from the tray popup, which hides on blur and would be
  unusable as something you click into.
- Mouse down/up become a **tap or a swipe** based on distance and duration; the scroll wheel
  becomes a swipe. Coordinates account for `object-fit: contain` letterboxing — without that
  every tap would land in the wrong place.
- Closing the window stops the capture; leaving the phone silently sharing would be alarming.

## Why JPEG frames rather than H.264
MediaCodec plus a decoder on the Mac is materially more work and commits the project to a video
pipeline in Electron. Scaled JPEG is enough for the "glance at the screen, tap a reply" workflow
this is for, and `screen_frame` can carry encoded video later without the protocol changing shape.

## Why an AccessibilityService for input
`INJECT_EVENTS` is system-only — it is exactly why scrcpy pushes a helper and runs it over adb
with shell privileges. An accessibility service is the only route available to a normal installed
app. Note this is the same permission declined for clipboard in Phase 6: there it was a
workaround for a restriction, here it is the mechanism doing the actual job.
The service declares no window-content access and never inspects the screen.

## Verified on device
- Capture consent flow runs, the service starts, and **frames arrive continuously**
  (`[envelope] screen_frame` repeatedly on the Mac).
- A dumped frame is a valid 332x720 JPEG showing the phone's real screen — the whole capture,
  encode, transport, decode path works.
- `RemoteInputService` is declared and visible to the system.
- All 33 tests still pass.

## Not verified
- **Remote input.** `enabled_accessibility_services` is currently `null`: the service must be
  switched on by hand. Tuhin: tap "Enable remote control (Accessibility settings)" in the app,
  enable PhoneLink Clone, then click and drag in the Mac window. Until then the Mac window shows
  "View only" and mirroring still works.
- Typed text (`input_text`) is defined in the protocol but not yet dispatched on the phone.

## Dev helpers added
`electron . --mirror` opens the phone window as soon as a phone connects, and
`--dump-frame <path>` writes the first frame to disk. Both exist because these paths cannot be
exercised by clicking from a script.

## Known gaps carried forward
- **~8fps and JPEG quality 55** — deliberate. Tunable in `ScreenCaptureService`.
- **`FLAG_SECURE` windows capture as black** (banking apps, DRM video). Not fixable.
- **`input_text` is unimplemented** on the phone side.
- **Consent is required per session** — Android offers no way to remember it, so the Mac can
  never silently start watching. That is a feature, not a gap.
- No rotation handling: the frame aspect changes but the window does not adapt.

## Next phase
Phase 9 — polish.
