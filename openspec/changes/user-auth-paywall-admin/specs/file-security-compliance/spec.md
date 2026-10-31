## ADDED Requirements

### Requirement: Binary Header and Extension Validation
The system SHALL validate all uploaded files by inspecting both their filename extension and their binary header (Magic Number) to prevent execution of disguised malicious files.

#### Scenario: Valid file upload passes inspection
- **WHEN** a user uploads a genuine PDF, PNG, JPG, or MP4 file with matching extension and magic bytes
- **THEN** the system passes the security inspection and proceeds with deduplicated storage

#### Scenario: Disguised malicious file rejected
- **WHEN** a user uploads an executable script (.sh, .exe, .bat, or HTML/JS) disguised with an image or PDF extension
- **THEN** the system detects the signature mismatch, rejects the file with HTTP 400, and returns a security warning message

### Requirement: File Size and Volume Limits
The system SHALL enforce strict file size limits based on file category to prevent disk exhaustion and denial-of-service attacks.

#### Scenario: File exceeds maximum allowed size
- **WHEN** a user attempts to upload a file exceeding the maximum threshold (e.g., 50MB for images/PDFs, 100MB for videos)
- **THEN** the system rejects the upload immediately before disk writing and alerts the user of the size limit

### Requirement: Content and Filename Compliance Filter
The system SHALL inspect filenames and textual metadata for illegal, sensitive, or offensive keywords before persistence.

#### Scenario: Sensitive keyword in filename or title
- **WHEN** a dynamic QR code title, description, or uploaded file name contains banned illegal/prohibited keywords
- **THEN** the system blocks submission, flags the violation, and requests revision from the user

#### Scenario: Extensible cloud content moderation hook
- **WHEN** cloud moderation environment variables (e.g., Tencent/Aliyun Content Security) are configured
- **THEN** the upload pipeline routes the file or media URL through the moderation API before making it publicly accessible
