## ADDED Requirements

### Requirement: Identify and Distinguish PDF Files
The system SHALL inspect file MIME types and filename extensions to distinguish PDF files (`.pdf` or `application/pdf`) from generic downloadable binary files in dynamic QR file collections.

#### Scenario: Display PDF file card with preview action
- **WHEN** user uploads a file with `.pdf` extension or MIME type `application/pdf`
- **THEN** system SHALL render a dedicated PDF badge and an "在线预览" (Preview) action button alongside the "下载" (Download) button

### Requirement: Fullscreen Interactive PDF Viewer Modal
The system SHALL provide a fullscreen modal overlay to display and read PDF files directly within the mobile scan landing page without requiring file downloads.

#### Scenario: Open PDF in fullscreen viewer
- **WHEN** user clicks "在线预览" on a PDF file card
- **THEN** system SHALL open a fullscreen reader modal embedding the PDF document with responsive height, zoom support, and top navigation containing close and download triggers

#### Scenario: Close PDF viewer modal
- **WHEN** user clicks the close icon or outside the reader area
- **THEN** system SHALL close the modal and return smoothly to the landing page file list

### Requirement: Synchronized Preview on Creator Workspace Mockup
The system SHALL reflect the PDF preview capability inside the desktop dual preview iPhone frame, allowing creators to test PDF readability before printing or distributing the QR code.

#### Scenario: Creator tests PDF in phone mockup
- **WHEN** creator switches the right preview pane to "手机落地页效果" with PDF files attached
- **THEN** system SHALL show the interactive "在线预览" trigger in the mockup view
