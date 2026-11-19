## ADDED Requirements

### Requirement: Composite QR Code into a Looping GIF

The system SHALL composite a user-uploaded background image and a user-uploaded QR code image into a looping GIF that follows the countdown → fade-in → hold timeline, with the QR code readable by common scanners in the final frames.

#### Scenario: Generate with default parameters
- **WHEN** an authenticated user uploads a background image and a QR code image and requests generation with default parameters
- **THEN** system SHALL produce a 800×800 GIF at 25fps with 117 frames (4.68s total) whose file size falls within the configured budget (default 1–3MB)
- **AND** the final frames SHALL decode successfully under all three verification conditions (native, 640px + blur, 480px + blur)

#### Scenario: Countdown text follows the timeline segments
- **WHEN** `waitSeconds` is 3
- **THEN** frames 0–24 SHALL show the countdown text with `{n}` replaced by 3, frames 25–49 by 2, frames 50–74 by 1
- **AND** the countdown SHALL be hidden during fade-in and the hold segment

#### Scenario: QR layer fades in without intermediate sharpness
- **WHEN** the fade-in segment renders
- **THEN** the QR layer SHALL keep a constant blur radius across every frame, changing only opacity (0→1) and scale (0.92→1.0)
- **AND** the system SHALL NOT render a sharp-then-blurred intermediate state

### Requirement: QR Code Preprocessing for the Overlay Layer

The system SHALL convert the uploaded QR code image into a transparent RGBA layer by treating white pixels as fully transparent and un-premultiplying the remaining RGB values so semi-transparent edges do not appear grey.

#### Scenario: White background becomes transparent
- **WHEN** a white-background QR image is processed
- **THEN** pixels that are pure white SHALL become fully transparent
- **AND** partially covered edge pixels SHALL retain their original colour rather than a grey-blended value

#### Scenario: Unreadable QR input is rejected
- **WHEN** the uploaded QR image cannot be decoded even at full opacity
- **THEN** system SHALL reject the request with a user-facing error identifying the QR image as unreadable
- **AND** system SHALL NOT charge or consume the order

### Requirement: Preflight Scan Feasibility Check

The system SHALL expose a free preflight endpoint that renders the final frame only and reports whether the current parameters produce a scannable QR code, returning a suggested parameter set when they do not.

#### Scenario: Parameters are scannable
- **WHEN** the client submits parameters that pass the three-condition decode on the final frame
- **THEN** system SHALL respond `{ ok: true }` without consuming any order

#### Scenario: Parameters are not scannable
- **WHEN** the preflight decode fails
- **THEN** system SHALL respond `{ ok: false, reason, suggestion }` where `suggestion` contains the nearest passing values for `cornerMult` and `qrOpacity`
- **AND** the client SHALL be able to apply the suggestion with a single action

### Requirement: Automatic Fallback When the Encoded GIF Is Not Scannable

The system SHALL verify scannability on frames extracted from the encoded GIF (never on in-memory frames) and automatically escalate parameters when verification fails.

#### Scenario: Escalation order
- **WHEN** verification fails on the encoded output
- **THEN** system SHALL raise `cornerMult` first, then `qrOpacity`, then `qrSize`, re-running the full render and encode at each level
- **AND** it SHALL report the applied adjustments in the response metadata

#### Scenario: Escalation exhausted
- **WHEN** every escalation level still fails verification
- **THEN** system SHALL respond with `422`, a failure reason, and the suggested parameters
- **AND** the order SHALL remain usable (not marked used)

### Requirement: Single-Use Billing for GIF Export

GIF generation SHALL use the existing single-use order flow with a dedicated `gif_export` pricing item, and the order SHALL only be consumed when a scannable GIF has been produced.

#### Scenario: Paywall active, no order attached
- **WHEN** a non-admin user requests generation while the `gif_export` price is active and no `orderId` is supplied
- **THEN** system SHALL respond `402` asking the user to complete payment first

#### Scenario: Generation succeeds
- **WHEN** the order is paid, owned by the caller, and the GIF is produced and verified
- **THEN** system SHALL mark the order `used`, store the resulting URL on the order, and return the download URL

#### Scenario: Generation fails
- **WHEN** rendering or verification ultimately fails
- **THEN** the order SHALL stay in `paid` state so the user can retry without paying again

#### Scenario: Repeated request with the same order
- **WHEN** the same `orderId` is submitted again after a successful generation
- **THEN** system SHALL return the previously generated URL without re-rendering and without additional charge

#### Scenario: Pricing disabled or zero
- **WHEN** the `gif_export` pricing item is disabled or priced at zero
- **THEN** generation SHALL proceed for logged-in users without requiring an order

### Requirement: Live Canvas Preview with Drag Positioning

The client SHALL render a live, animated canvas preview of the GIF locally, allowing the user to adjust the QR position, size, opacity, and copy before generating.

#### Scenario: Preview plays the animation loop
- **WHEN** the user has uploaded both images
- **THEN** the preview SHALL play the countdown → fade-in → hold sequence on a loop at 25fps with play/pause controls

#### Scenario: Drag to reposition the QR
- **WHEN** the user drags the QR layer on the canvas
- **THEN** the position SHALL be stored as an offset ratio relative to the canvas centre (range -0.5 to 0.5)
- **AND** the position SHALL remain visually stable when `outputSize` changes

#### Scenario: Preview is free
- **WHEN** the user adjusts parameters without clicking generate
- **THEN** no server render, order, or charge SHALL be incurred

### Requirement: Output Size Budget Control

The system SHALL keep the produced GIF within the configured size budget by reducing the canvas size and re-encoding rather than by degrading QR contrast.

#### Scenario: Output exceeds the budget
- **WHEN** the encoded GIF exceeds `targetSizeMb`
- **THEN** system SHALL reduce the canvas size one step (800 → 688 → 592 → 512), rescale `qrSize`, `haloPad`, and `blur` proportionally, and re-encode
- **AND** it SHALL attempt at most three reductions before returning the last result with a warning

#### Scenario: Output is smaller than expected
- **WHEN** the encoded GIF is smaller than 1MB
- **THEN** system SHALL accept it as-is without upscaling

### Requirement: Concurrent Generation Guard

The system SHALL limit simultaneous GIF generation jobs to protect server memory and CPU.

#### Scenario: Too many concurrent jobs
- **WHEN** the configured concurrency limit is reached
- **THEN** system SHALL respond `429` with a retry hint
- **AND** no order SHALL be consumed by the rejected request
