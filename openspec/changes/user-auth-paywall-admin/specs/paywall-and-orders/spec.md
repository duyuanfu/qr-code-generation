## ADDED Requirements

### Requirement: Paywall Interception Before QR Code Issuance
The system SHALL intercept QR code generation or high-resolution export for unauthenticated visitors and non-admin users until payment is completed.

#### Scenario: Unauthenticated visitor triggers QR action
- **WHEN** an unauthenticated visitor attempts to export a QR code or create a dynamic QR code
- **THEN** the system prompts the visitor with an authentication modal requiring login or registration

#### Scenario: Admin bypasses paywall
- **WHEN** a logged-in user with the 'admin' role creates or exports any QR code
- **THEN** the system skips payment verification and immediately completes the generation or export for free

#### Scenario: Regular user triggers paywall
- **WHEN** a logged-in user with the 'user' role clicks to generate a dynamic QR code or export a QR code for an unpaid session
- **THEN** the system opens a payment modal displaying the order details and the administrator's collection QR code

### Requirement: Order Generation and Lifecycle
The system SHALL create and track payment orders associated with user accounts and target QR generation tasks.

#### Scenario: Create payment order
- **WHEN** a user initiates a paid action
- **THEN** the system generates a unique order record with status 'pending', timestamp, user ID, action type, amount, and returns the order identifier

#### Scenario: Order expiration
- **WHEN** a pending order is not confirmed within the configured validity window (e.g., 30 minutes)
- **THEN** the order status transitions to 'expired' and subsequent confirmation attempts are rejected

### Requirement: Payment Verification and QR Unlock
The system SHALL support payment confirmation allowing the user to unlock and receive the generated QR code via admin manual review or demo simulation.

#### Scenario: User submits payment confirmation
- **WHEN** the user scans the displayed collection QR code and clicks "Payment Completed" (我已支付)
- **THEN** the order transitions to 'pending_review' status, and the payment modal polls for admin approval

#### Scenario: Admin approves payment order
- **WHEN** the administrator confirms the incoming payment in the admin console and marks the order as paid
- **THEN** the client polling detects the 'paid' status, and automatically unlocks the QR code creation or export pipeline

#### Scenario: Developer and demo mode mock payment
- **WHEN** running in development or demo mode and the user clicks "Simulate Payment" (测试一键支付)
- **THEN** the system immediately updates the order status to 'paid' and unlocks the QR code for seamless testing
