## ADDED Requirements

### Requirement: Batch QR Code Data Ingestion
The system SHALL support ingesting multiple data entries via CSV file upload, Excel (.xlsx/.xls) file upload, or multi-line plain text paste.

#### Scenario: Ingest Excel spreadsheet
- **WHEN** user drags and drops a `.xlsx` file containing a column of URLs and optional labels
- **THEN** system SHALL parse the rows, extract URL values and labels, and display a tabular preview of items ready for generation

### Requirement: Concurrent Batch QR Code Generation
The system SHALL render QR codes for all ingested rows asynchronously using Web Workers or sliced frame rendering without freezing the browser interface.

#### Scenario: Generate multiple QR codes with progress feedback
- **WHEN** user initiates batch generation for 50 records
- **THEN** system SHALL spawn worker tasks, update a visual progress bar in real-time, and display mini thumbnail previews as each QR code completes

### Requirement: Batch Packaging and Export
The system SHALL allow users to download all generated QR codes bundled in a single ZIP archive or preview an printable multi-label sheet layout.

#### Scenario: Download ZIP archive
- **WHEN** batch generation finishes and user clicks "Download All as ZIP"
- **THEN** system SHALL package all generated PNG or SVG files named according to row labels and trigger a client-side ZIP file download

### Requirement: Batch QR Code Decoding and Recognition
The system SHALL support uploading multiple images, pasting screenshots from clipboard, or selecting image folders to batch decode QR codes.

#### Scenario: Batch decode multiple QR code images
- **WHEN** user drops multiple image files into the decoding area
- **THEN** system SHALL process each image using native BarcodeDetector or fallback ZXing engine, and populate a result table displaying image thumbnail, decoding status, decoded content, and quick copy/open buttons

#### Scenario: Export decoding results
- **WHEN** batch decoding completes and user clicks "Export Results"
- **THEN** system SHALL generate and download a CSV / Excel file listing file name, status, and decoded text for every processed image
