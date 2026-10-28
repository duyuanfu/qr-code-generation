## ADDED Requirements

### Requirement: Multimedia Dynamic QR Code Creation
The system SHALL support uploading images, videos, and generic document files (PDF, Word, Zip) to generate a dynamic short URL QR code.

#### Scenario: Upload media assets via presigned storage URL
- **WHEN** user selects an image or video file to create a dynamic QR code
- **THEN** system SHALL obtain an S3 presigned upload URL from the server API, upload the file directly to object storage, and save the metadata record with a generated unique short ID

### Requirement: Responsive Mobile Scan Landing Page
The system SHALL provide an instant server-rendered mobile landing page at `/q/[shortId]` showcasing the uploaded content with full interactive capabilities.

#### Scenario: Mobile scan image gallery
- **WHEN** a mobile scanner opens the landing page of an image-type dynamic QR code
- **THEN** system SHALL display the images in a responsive gallery with pinch-to-zoom / lightbox preview and one-tap save capability

#### Scenario: Mobile scan video streaming
- **WHEN** a mobile scanner opens the landing page of a video-type dynamic QR code
- **THEN** system SHALL render an HTML5 video player enabling instant streaming playback with full screen support and download options

#### Scenario: Mobile scan file download
- **WHEN** a mobile scanner opens the landing page of a document file dynamic QR code
- **THEN** system SHALL display the file icon, file name, byte size, format tag, and a prominent "Download File" direct link button

### Requirement: Scan Analytics Logging
The system SHALL asynchronously record scan telemetry whenever a dynamic QR landing page is visited without blocking the page response.

#### Scenario: Record scan event
- **WHEN** a visitor scans and loads `/q/[shortId]`
- **THEN** system SHALL log timestamp, anonymized IP geolocation (country/city), and user-agent device category to the database
