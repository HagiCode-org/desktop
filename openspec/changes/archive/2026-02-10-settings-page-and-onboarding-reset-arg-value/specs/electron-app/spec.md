## ADDED Requirements

### Requirement: Settings Page Navigation

The application SHALL provide a Settings menu item in the sidebar navigation that allows users to access application-level configuration and system options.

#### Scenario: User accesses settings page

**GIVEN** the user has launched Hagicode Desktop
**WHEN** the user clicks the "Settings" menu item in the sidebar
**THEN** the application switches to the settings view
**AND** the settings page is displayed with a vertical tabs layout

#### Scenario: Settings menu item is visible

**GIVEN** the user has launched Hagicode Desktop
**WHEN** the user views the sidebar navigation
**THEN** a "Settings" menu item is displayed with a Settings icon
**AND** the menu item is positioned in the main navigation section

---

### Requirement: Settings Page Layout

The settings page SHALL use a vertical tabs layout with category tabs on the left side and corresponding settings content on the right side.

#### Scenario: Settings page displays vertical tabs

**GIVEN** the user has navigated to the settings page
**WHEN** the settings page is rendered
**THEN** a vertical tabs layout is displayed
**AND** category tabs are aligned to the left side
**AND** settings content is displayed on the right side

#### Scenario: Settings page is extensible

**GIVEN** the settings page is implemented with vertical tabs
**WHEN** new settings categories need to be added in the future
**THEN** new tabs can be added as independent components
**AND** each tab maintains a consistent layout pattern

---

### Requirement: Onboarding Settings

The settings page SHALL include an "Onboarding" settings category that provides a "Restart Wizard" button to reset the onboarding state and trigger the onboarding wizard.

#### Scenario: User restarts onboarding wizard

**GIVEN** the user has completed the onboarding process
**WHEN** the user navigates to Settings > Onboarding
**AND** clicks the "Restart Wizard" button
**THEN** the stored onboarding state is cleared
**AND** the onboarding wizard is displayed immediately
**AND** the user can re-configure data directory, download packages, install dependencies, and start the service

#### Scenario: Onboarding settings displays description

**GIVEN** the user has navigated to Settings > Onboarding
**WHEN** the onboarding settings section is displayed
**THEN** a description text explains the purpose of restarting the wizard
**AND** the "Restart Wizard" button is prominently displayed

#### Scenario: Onboarding reset provides feedback

**GIVEN** the user clicks the "Restart Wizard" button
**WHEN** the onboarding reset operation is in progress
**THEN** visual feedback is provided to the user
**AND** upon success, the onboarding wizard is displayed
**AND** upon failure, an error message is shown

---

### Requirement: Debug Mode Settings

The settings page SHALL include a "Debug" settings category that provides an "Ignore dependency check" toggle switch. When enabled, all dependencies are treated as not installed for testing purposes.

#### Scenario: User enables debug mode

**GIVEN** the user has navigated to Settings > Debug
**WHEN** the user clicks the "Ignore dependency check" toggle to enable it
**THEN** the debug mode state is saved to persistent storage
**AND** all dependencies are treated as not installed
**AND** the application displays the not installed state for all dependencies
**AND** the user can test the application behavior in the not installed state

#### Scenario: User disables debug mode

**GIVEN** debug mode is enabled
**WHEN** the user clicks the "Ignore dependency check" toggle to disable it
**THEN** the debug mode state is saved to persistent storage
**AND** normal dependency checking is restored
**AND** the application displays the actual installation status of dependencies

#### Scenario: Debug mode state persists

**GIVEN** the user has enabled or disabled debug mode
**WHEN** the user restarts the application
**THEN** the debug mode state is restored from persistent storage
**AND** the toggle reflects the last saved state
**AND** dependency checking behavior matches the saved state

#### Scenario: Debug settings displays description

**GIVEN** the user has navigated to Settings > Debug
**WHEN** the debug settings section is displayed
**THEN** a description text explains the purpose of ignoring dependency checks
**AND** the "Ignore dependency check" toggle is prominently displayed
**AND** the current state of the toggle is visible

---

### Requirement: Settings Page Internationalization

The settings page SHALL support internationalization with translations for all UI elements in both Chinese and English.

#### Scenario: Settings page displays in Chinese

**GIVEN** the user has selected Chinese as the application language
**WHEN** the user navigates to the settings page
**THEN** all UI elements are displayed in Chinese
**AND** the "Settings" menu item shows "设置"
**AND** the "Onboarding" tab shows "启动向导"
**AND** the "Debug" tab shows "调试"
**AND** the "Ignore dependency check" label shows "忽略依赖检查"

#### Scenario: Settings page displays in English

**GIVEN** the user has selected English as the application language
**WHEN** the user navigates to the settings page
**THEN** all UI elements are displayed in English
**AND** the "Settings" menu item shows "Settings"
**AND** the "Onboarding" tab shows "Onboarding"
**AND** the "Debug" tab shows "Debug"
**AND** the "Ignore dependency check" label shows "Ignore dependency check"
