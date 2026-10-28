## ADDED Requirements

### Requirement: Multi-stage Docker Containerization
The system SHALL provide a production-ready, multi-stage Dockerfile that packages the Next.js fullstack application with minimal runtime image footprint.

#### Scenario: Build Docker container image
- **WHEN** running `docker build -t qr-platform .`
- **THEN** Docker engine SHALL execute dependency installation, Next.js standalone build, and produce a lightweight secure Node.js runner container image

### Requirement: Docker Compose Orchestration
The system SHALL provide a `docker-compose.yml` file orchestrating the Next.js application, database (PostgreSQL or SQLite mount), and optional local MinIO S3 object storage service.

#### Scenario: Launch local self-hosted stack
- **WHEN** user executes `docker compose up -d`
- **THEN** all required services (web app, database, local storage bucket) SHALL spin up and initialize health checks ready to serve requests on the configured host port
