## ADDED Requirements

### Requirement: User Registration and Account Creation
The system SHALL provide an API and user interface for new users to register an account with a unique username or email and a password.

#### Scenario: Successful user registration
- **WHEN** an unauthenticated visitor submits a valid email and password (minimum 6 characters)
- **THEN** the system creates a new user record with role 'user', generates a session token, and logs the user in

#### Scenario: Registration with duplicate email
- **WHEN** a visitor attempts to register with an email that is already registered
- **THEN** the system rejects the registration with HTTP 400 and an error message indicating the account already exists

### Requirement: User Login and Authentication
The system SHALL authenticate existing users and establish a secure session via HTTP-only cookie or authorization token.

#### Scenario: Successful login with correct credentials
- **WHEN** a registered user submits their correct email and password
- **THEN** the system validates the password hash, issues an authentication session, and returns user profile data

#### Scenario: Failed login with incorrect credentials
- **WHEN** a user enters an incorrect email or password
- **THEN** the system denies authentication with HTTP 401 and does not disclose which field was incorrect

### Requirement: Session Management and Logout
The system SHALL allow authenticated users to retrieve their profile and cleanly terminate their session upon logout.

#### Scenario: Fetch current authenticated user
- **WHEN** an authenticated user loads the application
- **THEN** the system returns the current user ID, email, role, and active status

#### Scenario: User logs out
- **WHEN** an authenticated user clicks the logout action
- **THEN** the system clears the session cookie/token and resets the client session state

### Requirement: Role-based Authorization
The system SHALL enforce role distinctions between regular users ('user') and administrators ('admin').

#### Scenario: Admin role privileges
- **WHEN** a user with the 'admin' role accesses protected administrative routes or functions
- **THEN** the system grants access and bypasses paywall requirements

#### Scenario: Regular user restricted from admin routes
- **WHEN** a user with the 'user' role attempts to access admin APIs or pages
- **THEN** the system returns HTTP 403 Forbidden
