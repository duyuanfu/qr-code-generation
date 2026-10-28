## ADDED Requirements

### Requirement: Static QR Code Content Encoding
The system SHALL support generating offline static QR codes for multiple standard content types, including Plain Text, URL, vCard Contact, and WiFi credentials.

#### Scenario: Generate URL QR code
- **WHEN** user inputs a valid URL `https://example.com`
- **THEN** system SHALL instantly render a standard QR code encoding the exact URL string without any intermediate server redirection

#### Scenario: Generate vCard Contact QR code
- **WHEN** user fills in contact fields including name, phone number, email, and company
- **THEN** system SHALL format the input into standard vCard 3.0/4.0 format and encode it into the QR code matrix

### Requirement: Granular QR Beautification Engine
The system SHALL provide a multi-layered styling configuration interface that allows customizing dots shape, corner square shape, corner dot shape, gradient colors, center logo, and decorative frames.

#### Scenario: Customize dots shape and gradient color
- **WHEN** user selects rounded dots and configures a linear gradient from blue to purple
- **THEN** system SHALL render the QR matrix using circular modules with the specified linear gradient angle and colors

#### Scenario: Embed center logo with safe margin
- **WHEN** user uploads an image to be embedded as center logo
- **THEN** system SHALL position the logo in the center, scale it to a safe ratio (<= 25% of total width), clear a protective background zone around it, and enforce error correction level 'H' (30%)

### Requirement: Preset Style Templates
The system SHALL offer a curated set of preset aesthetic templates (such as Minimal Business, Social Vibrant, Catering/Store, Asset Label) allowing one-click application of coherent color and shape presets.

#### Scenario: Apply preset template
- **WHEN** user clicks on the "Minimal Business" preset template
- **THEN** system SHALL update the active styling configuration with navy blue theme, subtle rounded corner modules, and standard business margins

### Requirement: Multi-format High Resolution Export
The system SHALL support exporting the beautified QR code in PNG, WebP, and vector SVG formats at configurable pixel resolutions.

#### Scenario: Export vector SVG
- **WHEN** user clicks "Download SVG"
- **THEN** system SHALL generate an infinite-resolution vector SVG file preserving exact geometry, gradients, and logo assets
