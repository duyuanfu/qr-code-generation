## ADDED Requirements

### Requirement: Encode Barcode in the Selected Symbology

The system SHALL encode the supplied content into the requested one-dimensional symbology (EAN-13, EAN-8, UPC-A, Code 128, Code 39) and reject content that is not valid for that symbology with a user-facing reason.

#### Scenario: Valid content encodes successfully
- **WHEN** the user submits a 12-digit numeric string with `symbology = EAN_13`
- **THEN** the system SHALL produce a barcode whose normalised content is the 12 digits plus the computed check digit

#### Scenario: Content invalid for the symbology
- **WHEN** the content contains letters with `symbology = EAN_13`, or the length is not one of the accepted lengths
- **THEN** the system SHALL reject the request with `400` and an error naming the expected format (e.g. "EAN-13 需要 12 位数字，第 13 位自动生成")
- **AND** no order SHALL be consumed

#### Scenario: Code 128 accepts mixed content
- **WHEN** `symbology = CODE_128` and the content is any printable ASCII string of 1–48 characters
- **THEN** the system SHALL encode it, letting the encoder choose the optimal A/B/C subset automatically

#### Scenario: Unsupported symbology requested
- **WHEN** the client requests a symbology outside the supported set (e.g. `ITF_14`, `PDF_417`)
- **THEN** the system SHALL reject with `400` rather than silently falling back to another symbology

### Requirement: Checksum Completion and Validation for GS1 Symbologies

For EAN-13, EAN-8 and UPC-A the system SHALL compute and append the check digit when the user supplies only the data digits, and SHALL verify it when the user supplies the full code.

#### Scenario: Check digit appended
- **WHEN** the user supplies `690123456789` (12 digits) for EAN-13
- **THEN** the system SHALL append the mod-10 check digit and return the complete 13-digit code in `metrics.normalizedContent`
- **AND** `metrics.checksumAppended` SHALL be `true`

#### Scenario: Wrong check digit rejected with the correct value
- **WHEN** the user supplies a full 13-digit EAN-13 code whose last digit does not match the computed check digit
- **THEN** the system SHALL reject with `400` and state the correct check digit
- **AND** it SHALL NOT silently replace the user's digit with the computed one

#### Scenario: In-store codes are accepted
- **WHEN** the EAN-13 content begins with a prefix in the 20–29 range (in-store / weighted-goods codes)
- **THEN** the system SHALL accept it as long as the check digit is valid
- **AND** it SHALL NOT require the 69 country prefix

### Requirement: Integer-Module Physical Sizing

The system SHALL derive the barcode geometry from an integer number of pixels per module, and report the resulting physical size and magnification instead of scaling a rendered image to a target width.

#### Scenario: Module width is an integer pixel count
- **WHEN** the user requests `labelWidthMm = 40` at `dpi = 300` for EAN-13
- **THEN** the system SHALL compute `modulePx = floor(availablePx / totalModules)` and render at exactly `modulePx` pixels per module
- **AND** the resulting image width SHALL be an exact multiple of `modulePx`
- **AND** the system SHALL return `metrics.xMm`, `metrics.magnification` and `metrics.widthMm` describing the actual output

#### Scenario: Magnification outside the standard range
- **WHEN** the computed magnification falls outside 80%–200% for EAN/UPC symbologies
- **THEN** the system SHALL reject with `400` and state the label width range that would be valid at the selected DPI

#### Scenario: Magnification far from nominal
- **WHEN** the magnification deviates from 100% by more than 10% but remains within the valid range
- **THEN** the system SHALL include a non-blocking warning in `metrics.warnings` explaining the deviation

#### Scenario: Label too narrow for a readable module width
- **WHEN** `modulePx` would be below 2 pixels
- **THEN** the system SHALL include a warning recommending a higher DPI or a wider label

### Requirement: Quiet Zone and Contrast Invariants

The system SHALL always reserve the required quiet zone on both sides of the symbol and SHALL render black bars on a pure white opaque background.

#### Scenario: Quiet zone is never cropped
- **WHEN** any barcode is rendered
- **THEN** the output SHALL include at least 11 modules of white space on the left and on the right for EAN/UPC, and 10 module-widths for Code 128 / Code 39
- **AND** the system SHALL NOT expose an option to trim it

#### Scenario: Background is opaque white
- **WHEN** the PNG is produced
- **THEN** the image SHALL be RGB without an alpha channel and the background SHALL be `#FFFFFF`
- **AND** bar colour SHALL be `#000000`

#### Scenario: Colour customisation is not offered
- **WHEN** the client sends colour-related fields
- **THEN** the system SHALL ignore them rather than applying a palette that could break scanner contrast

### Requirement: Free Low-Resolution Preview

The system SHALL expose a free, anonymous preview endpoint that returns a one-pixel-per-module rendering of the barcode together with the computed metrics.

#### Scenario: Preview is free and stateless
- **WHEN** an anonymous user submits preview parameters
- **THEN** the system SHALL respond with a base64 data URL and the metrics object
- **AND** it SHALL write no file to disk and consume no order

#### Scenario: Preview is not printable
- **WHEN** the preview is rendered
- **THEN** it SHALL use exactly one pixel per module regardless of the requested DPI
- **AND** no watermark SHALL be added, because the low resolution is itself the limit

#### Scenario: Preview surfaces parameter errors
- **WHEN** the preview parameters are invalid (bad content, magnification out of range)
- **THEN** the system SHALL respond `400` with the same message the export endpoint would produce

### Requirement: Print-Ready Export

The system SHALL produce a raster image at the requested DPI and a vector SVG measured in millimetres, both matching the reported metrics.

#### Scenario: PNG exported at the requested DPI
- **WHEN** the user exports with `dpi = 300`
- **THEN** the PNG's pixel dimensions SHALL correspond to `metrics.widthMm` / `metrics.heightMm` at 300 dpi within one pixel

#### Scenario: SVG uses millimetres and merged runs
- **WHEN** the user exports with the SVG format
- **THEN** the SVG root SHALL declare `width` / `height` in `mm` and a `viewBox` in module coordinates
- **AND** consecutive dark modules in a row SHALL be emitted as a single `rect` rather than one per module

#### Scenario: Human-readable text is drawn
- **WHEN** `showText` is true
- **THEN** the normalised content SHALL be rendered below the bars in a monospaced font
- **AND** the text SHALL NOT overlap the bars or extend beyond the label width

### Requirement: Decode Verification Before Delivery

The system SHALL decode the rendered barcode before returning it, under both an ideal condition and a degraded condition, and SHALL refuse to deliver or charge when either fails.

#### Scenario: Both decode conditions pass
- **WHEN** the rendered barcode decodes to the requested content and format at native size and after downscaling to 50% with a 1px blur
- **THEN** the system SHALL deliver the files and consume the order

#### Scenario: Verification fails
- **WHEN** either decode condition fails or decodes different content
- **THEN** the system SHALL respond `422` with the failing condition named
- **AND** the order SHALL remain in `paid` state so the user can retry without paying again

### Requirement: Single-Use Billing for Barcode Export

Barcode export SHALL use the existing order flow with a dedicated `barcode_export` pricing item priced at ¥2.00, and the order SHALL only be consumed when a verified barcode has been written to disk.

#### Scenario: Paywall active, no order attached
- **WHEN** a non-admin user requests export while the `barcode_export` price is active and no `orderId` is supplied
- **THEN** the system SHALL respond `402` asking the user to complete payment first

#### Scenario: Order does not match the feature
- **WHEN** the supplied order's `action_type` is not `barcode_export`, or the order belongs to another user, or the status is not `paid`
- **THEN** the system SHALL respond `402` and SHALL NOT render

#### Scenario: Repeated request with the same order
- **WHEN** the same `orderId` is submitted after a successful export
- **THEN** the system SHALL return the previously stored URLs without re-rendering and without additional charge

#### Scenario: Pricing disabled or zero
- **WHEN** the `barcode_export` pricing item is disabled or priced at zero
- **THEN** export SHALL proceed for logged-in users without requiring an order
