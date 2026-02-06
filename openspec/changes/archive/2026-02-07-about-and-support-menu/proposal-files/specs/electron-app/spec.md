# 关于与支持菜单规范增量

## ADDED Requirements

### Requirement: External Link Menu Items

The system SHALL provide external link menu items in the sidebar navigation that allow users to quickly access official resources without leaving the application context.

#### Scenario: User clicks on official website menu item
- **WHEN** user clicks on the "Official Website" menu item in the sidebar
- **THEN** the system SHALL open https://hagicode.com/ in the system default browser
- **AND** the application SHALL remain in its current state without view switching
- **AND** the system SHALL use the Globe icon to represent this menu item

#### Scenario: User clicks on technical support group menu item
- **WHEN** user clicks on the "Technical Support" menu item in the sidebar
- **THEN** the system SHALL open the QQ group join page (https://qm.qq.com/q/FoalgKjYOI) in the system default browser
- **AND** the application SHALL remain in its current state without view switching
- **AND** the system SHALL display the QQ group number (610394020) in the menu description
- **AND** the system SHALL use the Users icon to represent this menu item

#### Scenario: User clicks on GitHub project menu item
- **WHEN** user clicks on the "GitHub Project" menu item in the sidebar
- **THEN** the system SHALL open https://github.com/HagiCode-org/site in the system default browser
- **AND** the application SHALL remain in its current state without view switching
- **AND** the system SHALL encourage users to star the project in the menu description
- **AND** the system SHALL use the Star icon to represent this menu item

#### Scenario: External link menu items display correctly
- **WHEN** the sidebar navigation is rendered
- **THEN** the system SHALL display three external link menu items at the bottom of the navigation
- **AND** each menu item SHALL include an appropriate icon, label, and optional description
- **AND** the menu items SHALL be visually distinct from view-switching menu items
- **AND** the system SHALL support displaying tooltips on hover

#### Scenario: Internationalization support for menu items
- **WHEN** user switches language between Chinese and English
- **THEN** the system SHALL display all external link menu item labels in the selected language
- **AND** all menu item descriptions SHALL be translated correctly

#### Scenario: URL security validation
- **WHEN** user clicks on an external link menu item
- **THEN** the system SHALL validate the URL protocol before opening
- **AND** the system SHALL only allow http:// and https:// protocols
- **AND** the system SHALL reject invalid or malicious URLs
- **AND** the system SHALL log errors when URL validation fails

### Requirement: Open External API

The system SHALL provide a secure API for opening external URLs in the system default browser.

#### Scenario: Successful external link opening
- **WHEN** the openExternal API is called with a valid URL
- **THEN** the system SHALL validate the URL protocol and domain
- **AND** the system SHALL call Electron's shell.openExternal() method
- **AND** the system SHALL return a success response to the renderer process

#### Scenario: External link opening failure
- **WHEN** the openExternal API is called but fails to open the URL
- **THEN** the system SHALL return an error response with a descriptive error message
- **AND** the system SHALL log the error for debugging purposes
- **AND** the renderer process SHALL handle the error gracefully

#### Scenario: Invalid URL protocol
- **WHEN** the openExternal API is called with a URL using an invalid protocol (e.g., file://, javascript:)
- **THEN** the system SHALL reject the request
- **AND** the system SHALL return an error response indicating invalid protocol
- **AND** the system SHALL NOT attempt to open the URL

## MODIFIED Requirements

### Requirement: Sidebar Navigation Structure

The system SHALL support both view-switching menu items and external link menu items in the sidebar navigation.

#### Scenario: Mixed menu item types in navigation
- **WHEN** the sidebar navigation is rendered
- **THEN** the system SHALL display view-switching menu items at the top
- **AND** the system SHALL display external link menu items at the bottom
- **AND** the system SHALL optionally display a separator between the two groups
- **AND** each menu item SHALL have appropriate click handling based on its type

#### Scenario: Menu item type differentiation
- **WHEN** a menu item is clicked
- **THEN** the system SHALL check the menu item type
- **AND** if the type is 'view', the system SHALL switch to the specified view
- **AND** if the type is 'external-link', the system SHALL open the configured URL
- **AND** the system SHALL handle errors appropriately for each type
