# Thought Bubble Studio

A local cybersecurity photo station for Windows and macOS, designed for a 2160 × 3840 portrait display. The idle screen is a full-screen camera with one start button. Electric-blue cloud thought bubbles activate after a face stays in frame for two continuous seconds.

## Run on this computer

- Install Node.js 22 or later for development.
- Run `npm install`, then `npm start` to open the desktop app.
- `npm run dev` opens the browser development preview at `http://127.0.0.1:5173/`.
- Add `?demo=1` to the browser preview URL to try the full journey with an illustration. Browser preview does not save participant records or submit print jobs. Use the desktop application at an event.

## Operator access

Hold the CYBER THOUGHT BUBBLE heading for about 2 seconds, or press **Ctrl + Shift + A**. Set a private 6–12 digit PIN on first use. Operator sessions expire after 30 minutes.

The operator panel includes:

- **Phrases:** all 60 supplied English phrases with editable Arabic translations, enable/disable controls, and new phrase entry. At least one phrase must remain enabled.
- **Certificate:** editable English and Arabic titles and acknowledgement wording.
- **Station:** a selector for every available camera, **Refresh devices** for newly connected cameras/printers, mirrored capture, printer selection, direct printing, fullscreen, and exit.
- **Records:** saved completions, CSV export, and reprint controls.

Select the camera, then **Save changes**. Allow camera access in macOS or Windows privacy settings. If device names are hidden, allow access and refresh the device list. Close other applications that have exclusive control of the camera.

## Participant journey

1. The idle screen processes the camera locally. A face continuously in frame for 2 seconds triggers four animated thought bubbles. Leaving the frame resets activation. The largest visible face is the primary participant.
2. Tap **Create my certificate**, choose English or Arabic, and enter a name or email. A touch keyboard is available beside the entry field.
3. Stand in the capture area. Once the face is ready, tap **Take my photos**.
4. A 3-second countdown precedes three photographs. Face loss interrupts capture and asks the participant to retry.
5. Choose one certificate photograph and tap **Save & print certificate**.
6. The app saves the selected JPEG and completion record before opening the system print dialog or submitting directly to the configured printer. Unselected photographs are discarded when the session resets.
7. The assistant hands over the print. The final screen resets after 45 seconds of inactivity; unfinished forms and selection screens reset after 2 minutes.

Email addresses are recorded locally, never emailed, and never shown on the printed certificate. An email-only entry prints “Cybersecurity participant” instead of the address.

## Printing

The certificate is a **1200 × 1800 JPEG**, designed for **4 × 6 inch portrait photo paper at 300 dpi**. Choose 4 × 6 paper, portrait orientation, and the appropriate borderless option in the printer driver. Make one physical calibration print before the event; drivers vary in their borderless margins and available paper sizes.

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

## Verification

`npm test` checks continuous face presence, face loss and reacquisition, operator authentication, throttling, configuration validation, and durable photo/completion saving.

Additional development checks are in `scripts/verify-ui.cjs`, `scripts/verify-camera.cjs`, and `scripts/verify-desktop.cjs`. They use Playwright (set `PLAYWRIGHT_PATH` to an installed package if it is not in this project) and Chrome. The camera test requires Google’s MediaPipe test portrait at `/tmp/thought-bubble-test-portrait.jpg`. These scripts use isolated test records and an explicitly labelled illustration for UI tests. Hardware camera quality and actual paper output must be verified on the event station.

## Builds included with this delivery

- `release/Thought Bubble Studio-1.0.0-arm64.dmg`: Apple Silicon Mac build. Packaged launch, fullscreen, camera stream, bundled detector, and local storage were checked on macOS.
- `release/Thought Bubble Studio-1.0.0-win.zip`: Windows x64 portable build. Extract the entire archive to a folder and run `Thought Bubble Studio.exe`; keep its accompanying files together. Archive integrity was checked, but Windows execution was not available on this Mac.

The Windows NSIS installer could not be generated on this Mac host; the complete portable build is provided instead. For a portable build from source use `npm run dist:win:zip`. Physical printer output remains to be calibrated on the event printer.
