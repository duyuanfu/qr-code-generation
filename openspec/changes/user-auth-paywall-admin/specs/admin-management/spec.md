## ADDED Requirements

### Requirement: Admin User Management
The system SHALL provide an administrative interface allowing admins to list, inspect, and toggle the status of user accounts.

#### Scenario: Admin lists registered users
- **WHEN** an authenticated admin accesses the user management page
- **THEN** the system displays a paginated list of users including ID, email, role, status, creation date, and total orders

#### Scenario: Admin toggles user active status
- **WHEN** an admin disables a user account
- **THEN** that user cannot log in and any active sessions are revoked upon their next request

### Requirement: Pricing Configuration Management
The system SHALL allow administrators to view and configure prices for various QR generation services.

#### Scenario: Update service pricing
- **WHEN** an admin updates the price for static export or dynamic QR generation and clicks save
- **THEN** the new price is saved to the persistent database and immediately applied to all subsequent orders

#### Scenario: Set service to zero price
- **WHEN** an admin sets the price of a feature to 0
- **THEN** the system automatically treats that feature as free for all users without showing the payment modal

### Requirement: Receiving QR Code Configuration
The system SHALL allow administrators to upload, preview, and configure their WeChat or Alipay receiving QR code (收款码) and guidance instructions.

#### Scenario: Admin uploads new collection QR code
- **WHEN** an admin uploads an image of their payment collection QR code and enters payment guidance text
- **THEN** the system stores the image, updates the active collection configuration, and reflects the new QR code in the frontend payment modal

#### Scenario: Admin disables collection
- **WHEN** an admin toggles off the collection status
- **THEN** the frontend indicates that payment processing is temporarily paused or unlocks free generation depending on policy

### Requirement: Order Audit and Manual Reconciliation
The system SHALL provide an order audit log in the admin console to review and reconcile transactions.

#### Scenario: Admin inspects order log
- **WHEN** an admin navigates to the order management tab
- **THEN** the system displays all orders with columns for Order ID, User, Amount, Status (pending/paid/expired), Creation Time, and Paid Time

#### Scenario: Admin manually marks order as paid
- **WHEN** an admin verifies an offline payment and clicks "Mark Paid" on a pending order
- **THEN** the order status is updated to 'paid' and the corresponding user's operation is unlocked
