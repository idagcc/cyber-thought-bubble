# Thought Bubble Studio

A local cybersecurity photo station for Windows and macOS, designed for a landscape display (1920 × 1080 or 3840 × 2160). The idle screen is a full-screen camera with the **Cyber Thought Bubble** title, a chrome **Cyber Carnival** logo, cyan and pink event lighting, and a compact gold start button. Glossy 3D cloud, fingerprint-lock, shield, and gold-star artwork sits beside the thoughts and appears in the certificates and completion screen. The navy/gold certificate design follows the supplied Cyber Carnival reference; all event artwork is bundled locally for offline use. Camera selection is hidden until opened with its keyboard shortcut. Transparent blue liquid-glass bubbles activate independently for each face after a two-second settle. Layered organic silhouettes, cyan rims and soft curved reflections follow the supplied speech-bubble reference. The camera remains visible through the glass. Text is rasterized once at double resolution and moves as a single layer, avoiding per-frame changes to letter edges. Quiet spring motion and damped contacts keep thoughts steady and clear of faces and controls.

## Run on this computer

- Install Node.js 22 or later for development.
- Run `npm install`, then `npm start` to open the desktop app.
- Run `npm run record` for a clean, borderless **1280 × 720 (16:9)** window for client recordings. Resize it while preserving 16:9; use **Cmd + Q** on Mac or **Alt + F4** on Windows to close it. Record the Thought Bubble Studio window. Every app screen stays within a centered 16:9 frame, with black borders when the display has a different shape.
- Press **Ctrl + Shift + C** (or **Cmd + Shift + C** on Mac) in the live screen to open **Select camera**. Press the shortcut again or **Escape** to hide it; choosing a camera also closes it. The selector closes before capture and while operator settings are open. The refresh button finds newly connected cameras. This selection lasts for the current run; save it in **Operator → Station** to use it on future launches.
- `npm run dev` opens the browser development preview at `http://127.0.0.1:5173/`.
- Add `?demo=1` to the browser preview URL to try the full journey with an illustration. Browser preview does not save participant records or submit print jobs. Use the desktop application at an event.

## Operator access

Hold the Cyber Thought Bubble heading for about 2 seconds, or press **Ctrl + Shift + A** (or **Cmd + Shift + A** on Mac). Set a private 6–12 digit PIN on first use. Operator sessions expire after 30 minutes. Switch English/Arabic with **Ctrl + Shift + L** (or **Cmd + Shift + L** on Mac), or use `?lang=ar` in the browser preview.

The operator panel includes:

- **Phrases:** all 60 supplied English phrases with editable Arabic translations, enable/disable controls, and new phrase entry. At least one phrase must remain enabled.
- **Certificate:** editable English and Arabic titles and acknowledgement wording, with landscape or portrait print format. New and upgraded stations default to **6 × 4 landscape**.
- **Station:** a selector for every available camera, **Refresh devices** for newly connected cameras/printers, mirrored capture, printer selection, **Save & print test page**, direct printing, fullscreen, and exit.
- **Records:** saved completions, CSV export, and reprint controls.

Select the camera, then **Save changes**. Allow camera access in macOS or Windows privacy settings. If device names are hidden, allow access and refresh the device list. Close other applications that have exclusive control of the camera.

## Participant journey

1. Lobby mode detects all visible faces locally. Each person activates after a 2-second hold. Detection gaps up to 450 ms retain their bubbles and activation; longer departures reset the timer. One person can receive four thoughts, two people up to two each, and larger groups up to one each. Up to eight people receive bubbles; available space can reduce this further. No thought covers a detected face, another thought or the primary action area. Capture requires a fresh, actually detected face; the visual grace period cannot authorize a photo.
2. Tap **Create my certificate**. A large **5, 4, 3, 2, 1** countdown starts immediately, giving the person who touched the screen time to move into the camera view. No form or second capture button is required.
3. Face the camera and hold position. After the countdown, the station automatically takes three photographs. All visible, activated participants keep their own thoughts during capture; there is no single selected-person portrait crop. If the camera loses the group or tracking becomes stale, return to the live view and retry.
4. Choose one certificate photograph and tap **Save & print certificate**. Walk-up certificates use a generic participant label.
5. The app saves the selected JPEG and completion record before opening the system print dialog or submitting directly to the configured printer. Unselected photographs are discarded when the session resets.
6. The assistant hands over the print. The final screen resets after 45 seconds of inactivity; the selection screen resets after 2 minutes.

## Printing

The default certificate is an **1800 × 1200 JPEG**, designed for **6 × 4 inch landscape photo printing at an effective 300 dpi**. Load 4 × 6 inch (10 × 15 cm) paper, choose landscape orientation, and set the appropriate paper type, tray and borderless option in the printer driver. The landscape photo area is **1800 × 820**, filled edge to edge with the camera image using a proportional crop, without stretching or artificial side panels. The optional portrait format remains available; reprinting an older photo follows that saved photo’s orientation.

For the event hardware test, follow **TEST-WINDOWS.txt**, also included in the Windows package. In **Operator → Station**, select the printer and click **Save & print test page**. This saves the current settings and prints a calibration certificate with edge markers and colour swatches, without creating a participant record. Start with the system dialog; enable direct printing only after checking a physical sheet. Drivers vary in their borderless margins and available paper sizes.

The default uses the operating system print dialog for assisted printing. Enable **Print directly without the system dialog** only after choosing and testing the event printer. A `submitted` status means the operating system accepted the job; it does not verify that paper physically came out. Cancelled or failed printing leaves the saved photo available for retry.

## Local storage

Use **Station → Open data folder** to locate the station’s files:

- `photos/<record-id>.jpg`: selected certificate JPEGs.
- `records.json`: participant identifier, language, completion date, photo path and print status.
- `config.json`: phrase library and station settings.
- `operator.json`: salted operator PIN hash.

The data folder lives under the operating system’s per-user application data directory. Data is not cloud-synced by the application and is not encrypted by the app. Use the event computer’s OS account and disk protection and manage retention according to the event’s requirements. No face identities, face templates, audio, or continuous video are saved. Back up the data folder if needed before deleting records manually while the app is closed.

## Desktop packages

- `npm run dist:mac` creates a macOS DMG for the build machine’s architecture.
- `npm run dist:win` creates the Windows NSIS installer. A Windows build host is recommended for Windows release validation.
- `npm run pack` creates an unpacked desktop application.

Packaged applications launch fullscreen. Signing/notarization certificates are not included; unsigned builds may prompt operating-system confirmation when transferred to another computer. Use your organization’s signing process for managed distribution.

All fonts, MediaPipe WASM files, and the face-detection model are bundled in the app, so event operation does not need internet access. Installation and packaging fetch build dependencies.

## Detection and performance

The bundled full-range sparse BlazeFace model runs on the CPU in a dedicated Web Worker, separately from the interface and bubble animation. Each frame receives a full-view pass plus two overlapping detail passes. Six detail windows cover the whole frame over three submissions, giving small/distant faces more model pixels without changing the displayed camera framing. Duplicate full/detail detections are merged; the 0.5 confidence threshold is unchanged. This uses more CPU per submitted frame than the earlier single-pass path. Camera frames are transferred as ImageBitmaps, capped at 1280 pixels wide, at most about 12 times per second. Only one frame can be in flight; intermediate frames are skipped rather than queued. Results older than 300 ms cannot authorize capture. A stalled worker is terminated and offers a retry.

In earlier single-pass checks, the short-range model missed three smaller faces in the development fixture; the full-range model detected all three. In the Mac test fixture, inference took approximately 28 ms. The earlier single-pass packaged Mac app with a real camera showed 26.8 ms inference and 50 fps rendering. These are development observations, not Windows hardware guarantees. Lighting, distance, face size, camera quality and camera field of view are important limits. A dedicated GPU is not required by this build. Adding more workers per face would duplicate full-frame inference and compete for CPU resources.

Public camera status text, face brackets and diagnostics are hidden to keep the installation readable from a distance. Face count, CPU inference time and rendering rate remain available as camera data attributes for development checks. Reduced-motion preferences disable drifting, glass breathing and squash. Each of the four glass variants caches three transparent skins. The skins drift, tilt and breathe independently on slow, different rhythms; reflections follow their skin while text stays steady. Reduced-motion views and photographs use the still composite. Text layers and wrapping are cached, with font-load invalidation. Live view and certificates share the same artwork. The 2D simulation runs at a fixed 120 Hz with display-rate extrapolation for 144/165 Hz panels, critically damped springs, low-restitution contacts and conservative face obstacles. Smooth clearance absorbs small detector jumps while the actual measured face remains protected. It preserves safe anchors and searches for a new layout only when the group changes or people move substantially. A trapped thought recovers independently, without snapping the whole group. This is a 2D visual simulation. Earlier Blender artwork remains in `assets/bubbles/` for reference.

A local stationary eight-person physics benchmark averaged approximately 0.12 ms per display frame after this change, compared with 2.95 ms before it (600 simulated frames, including initial allocation). This measures JavaScript layout/physics only, not camera inference, drawing, or event hardware performance.

Primary implementation references: [Google web worker guidance](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js) and [model details and CPU/GPU benchmarks](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector). GPU performance depends on the runtime and hardware; it is not automatically faster.

## Verification

`npm test` checks camera recovery, multi-face matching and independent activation, group capture readiness and loss, worker backpressure and disposal, moving-crowd collision boundaries, reduced motion, resizing, print layouts, authentication and saved records. `npm run build` checks TypeScript and generates the offline application. `node_modules/.bin/electron scripts/verify-print-layout.cjs` renders the current calibration to a one-page 6 × 4 PDF without submitting a printer job.

For a repeatable development camera check, run `npm run dev` and open `/qa.html`. This clearly labelled test page feeds a repeated public portrait fixture through the real bundled detector. It offers one-, two-, three- and four-person scenes, motion, face loss, a 200 ms detection dropout, a small third-face recovery check and a calibration export. In the small-face check, the full-view pass finds two people while the combined detector/tracker retains all three. Add `?wide=1` to inspect the full landscape camera in a narrow preview panel; `?artwork=1` previews the four animated transparent blue shells and offers still PNG downloads. The test toolbar shows face/bubble counts, frame rate, physics/drawing timings and layout revisions. Open `/qa.html?live=1&paused=1` for a real-camera check with Start/Stop controls, actual detection outlines, full-view versus combined counts, inference/frame timings and text-motion diagnostics. Stopping the check releases the camera; this page does not record video. It is excluded from desktop packages and never activates automatically. It is a synthetic group fixture, not evidence of live crowd accuracy. The real event camera must be checked separately. The kiosk drawing establishes the screen and camera placement, but the camera lens field of view and mounting angle determine the final standing distance. Hardware camera quality and physical paper output must be checked on the event PC and printer.

Additional optional Playwright checks are in `scripts/verify-ui.cjs` and `scripts/verify-desktop.cjs`; they intercept printer submissions rather than sending physical jobs. Run the UI script first to generate its certificate fixtures. Use `PLAYWRIGHT_PATH` to select an alternate installed Playwright package if needed.

## Packaged delivery

The source and `dist/` include the five-second walk-up countdown, minimal live UI and landscape group capture. Rebuild desktop packages before distributing these changes; existing files in `release/` predate this update.

The previous **1.3.0** packages contain the lobby, worker and physics update. Older 1.0/1.1/1.2 packages in `release/` do not include all these changes.

- `release/v1.3.0/mac-arm64/Thought Bubble Studio.app`: refreshed Mac application for this computer. The already-running session is left open.
- `release/Thought Bubble Studio-1.3.0-win.zip`: Windows x64 portable build. Extract the complete archive and run `Thought Bubble Studio.exe`; keep its accompanying files together.
- `build/printer-test-6x4.jpg`: updated calibration certificate, also included with the Windows build.

The Windows portable archive can be generated on this Mac with `npm run dist:win:zip`. Windows execution and physical printer output require the event PC, driver and printer. The printer model has not been provided.
