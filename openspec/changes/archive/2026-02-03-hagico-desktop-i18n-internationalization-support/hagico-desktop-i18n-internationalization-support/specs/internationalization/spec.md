# 国际化能力规范增量

本规范定义了 Hagicode Desktop 应用程序的国际化（i18n）能力要求。

## ADDED Requirements

### Requirement: i18next 框架集成

The application SHALL integrate and configure the i18next framework to support multi-language interfaces. The i18next instance MUST be properly initialized during application startup, the application MUST use I18nextProvider to wrap the root component, and it MUST support at least two languages (Simplified Chinese zh-CN and English en-US). When users switch languages, all interface text MUST immediately update to the new language.

应用程序必须集成并配置 i18next 框架以支持多语言界面。i18next 实例必须在应用启动时正确初始化，使用 I18nextProvider 包裹应用根组件，并支持至少两种语言（简体中文 zh-CN 和英文 en-US）。当用户切换语言时，所有界面文本必须立即更新为新语言。

#### Scenario: 应用启动时初始化 i18next / Initialize i18next on application startup

- **WHEN** 应用程序启动 / The application starts
- **AND** React 渲染根组件 / React renders the root component
- **THEN** i18next 实例已初始化 / The i18next instance is initialized
- **AND** 默认语言设置为 zh-CN / The default language is set to zh-CN
- **AND** I18nextProvider 已包裹应用 / I18nextProvider wraps the application

#### Scenario: 切换语言时更新界面 / Update interface when switching language

- **GIVEN** 应用程序正在运行 / The application is running
- **WHEN** 用户切换语言 / The user switches language
- **THEN** 所有界面文本立即更新为新语言 / All interface text immediately updates to the new language
- **AND** 组件状态保持不变 / Component state remains unchanged

### Requirement: 翻译资源管理

The application MUST use namespaced JSON files to manage translation resources. Translation resources MUST be divided into three namespaces by functional domain: common, components, and pages, with each namespace using a separate JSON file. Translation keys MUST use a dot-separated hierarchical structure (e.g., `components.packageManagement.cardTitle`). The application MUST support complete Simplified Chinese translations.

应用程序必须使用命名空间化的 JSON 文件管理翻译资源。翻译资源必须按功能域划分为 common、components、pages 三个命名空间，每个命名空间使用独立的 JSON 文件。翻译键必须使用点分隔的层次结构（如 `components.packageManagement.cardTitle`）。必须支持简体中文的完整翻译。

#### Scenario: 加载翻译资源 / Load translation resources

- **WHEN** 应用程序启动 / The application starts
- **AND** i18next 初始化 / i18next initializes
- **THEN** 加载所有命名空间的翻译资源 / All namespace translation resources are loaded
- **AND** 默认语言（zh-CN）翻译完整可用 / Default language (zh-CN) translations are fully available

#### Scenario: 访问嵌套翻译键 / Access nested translation keys

- **GIVEN** 组件使用 useTranslation Hook / A component uses the useTranslation Hook
- **WHEN** 调用 t('components.packageManagement.cardTitle') / Calling t('components.packageManagement.cardTitle')
- **THEN** 返回正确的翻译文本 / Returns the correct translated text
- **AND** 翻译文本在界面上正确显示 / The translated text displays correctly on the interface

### Requirement: 组件国际化集成

All UI components MUST use the useTranslation Hook to replace hardcoded text. Components MUST NOT contain hardcoded English text (except technical terms), MUST reference all localizable content using translation keys, and MUST support interpolation variables (e.g., `{{name}}`). Component functionality and styling MUST remain unchanged after migration.

所有 UI 组件必须使用 useTranslation Hook 替换硬编码文本。组件中不得包含硬编码英文文本（技术术语除外），必须使用翻译键引用所有可本地化内容。翻译必须支持插值变量（如 `{{name}}`），且组件迁移后功能和样式必须保持不变。

#### Scenario: 组件使用翻译文本 / Component uses translated text

- **GIVEN** 组件已迁移到 i18n / A component has been migrated to i18n
- **WHEN** 组件渲染 / The component renders
- **THEN** 所有文本从翻译资源加载 / All text is loaded from translation resources
- **AND** 界面显示当前语言的文本 / The interface displays text in the current language

#### Scenario: 组件支持插值 / Component supports interpolation

- **GIVEN** 翻译键包含插值变量 {{name}} / A translation key contains an interpolation variable {{name}}
- **WHEN** 调用 t('key', { name: 'John' }) / Calling t('key', { name: 'John' })
- **THEN** 返回插值后的文本 / Returns the interpolated text
- **AND** 界面正确显示插值结果 / The interface correctly displays the interpolated result

### Requirement: 语言切换功能 / Language Switching

The application MUST provide a language selector component in the settings interface that allows users to switch the interface language. The language selector MUST support at least two languages, and the interface MUST take effect immediately after switching. Language options MUST display language names, and national flag icons are recommended.

应用程序必须在设置界面提供语言选择器组件，允许用户切换界面语言。语言选择器必须支持至少两种语言切换，切换后界面必须立即生效。语言选项必须显示语言名称，推荐显示国旗图标。

#### Scenario: 用户切换语言 / User switches language

- **GIVEN** 用户在设置页面 / The user is on the settings page
- **WHEN** 从下拉菜单选择新语言 / Selecting a new language from the dropdown menu
- **THEN** 界面文本立即更新为新语言 / Interface text immediately updates to the new language
- **AND** 语言偏好被保存 / Language preference is saved

#### Scenario: 显示可用语言列表 / Display available language list

- **GIVEN** 用户打开语言选择器 / The user opens the language selector
- **WHEN** 选择器展开 / The selector expands
- **THEN** 显示所有可用语言 / All available languages are displayed
- **AND** 每个语言显示本地名称和国旗图标 / Each language shows its native name and flag icon

### Requirement: 语言偏好持久化 / Language Preference Persistence

The application MUST persist user language selections using electron-store. When a user selects a new language, the language code MUST be saved to the `appSettings.language` key in electron-store. When the application restarts, it MUST automatically load and apply the previously selected language.

应用程序必须使用 electron-store 持久化用户的语言选择。当用户选择新语言时，语言代码必须保存到 electron-store 的 `appSettings.language` 键。应用程序重启后必须自动加载并应用上次选择的语言。

#### Scenario: 保存语言偏好 / Save language preference

- **GIVEN** 用户选择新语言 / The user selects a new language
- **WHEN** 语言切换完成 / Language switching is complete
- **THEN** 语言代码保存到 electron-store / The language code is saved to electron-store
- **AND** 保存键为 'appSettings.language' / The save key is 'appSettings.language'

#### Scenario: 恢复语言偏好 / Restore language preference

- **GIVEN** 用户之前选择了英文 / The user previously selected English
- **WHEN** 应用程序重新启动 / The application restarts
- **THEN** 自动加载并应用英文界面 / Automatically loads and applies the English interface
- **AND** 界面显示为英文 / The interface displays in English

### Requirement: Redux 状态管理 / Redux State Management

The application MUST use Redux to manage i18n-related state. It MUST define an i18nSlice containing states such as currentLanguage (current language code) and availableLanguages (list of available languages). It MUST provide a setCurrentLanguage action for updating the language, and the Redux state MUST be synchronized when switching languages.

应用程序必须使用 Redux 管理 i18n 相关状态。必须定义 i18nSlice 包含 currentLanguage（当前语言代码）、availableLanguages（可用语言列表）等状态。必须提供 setCurrentLanguage action 用于更新语言，且语言切换时必须同步更新 Redux state。

#### Scenario: 更新当前语言状态 / Update current language state

- **GIVEN** Redux store 已初始化 / Redux store is initialized
- **WHEN** dispatch setCurrentLanguage('en-US') / Dispatching setCurrentLanguage('en-US')
- **THEN** i18n state.currentLanguage 更新为 'en-US' / The i18n state.currentLanguage updates to 'en-US'
- **AND** 使用 selectCurrentLanguage 可读取新值 / The new value can be read using selectCurrentLanguage

#### Scenario: 读取可用语言列表 / Read available language list

- **GIVEN** Redux store 已初始化 / Redux store is initialized
- **WHEN** 组件调用 selectAvailableLanguages / A component calls selectAvailableLanguages
- **THEN** 返回包含所有支持语言的数组 / Returns an array containing all supported languages
- **AND** 每个语言包含 code、name、nativeName 属性 / Each language includes code, name, and nativeName properties

### Requirement: 回退机制 / Fallback Mechanism

The application MUST implement a fallback mechanism for missing translations. When a translation key does not exist in the current language, it MUST automatically fall back to the default language (en-US) for lookup. In development mode, warning logs MUST be recorded for missing translation keys, and in production mode, the key name or fallback language translation MUST be returned.

应用程序必须实现翻译缺失时的回退机制。当翻译键在当前语言中不存在时，必须自动回退到默认语言（en-US）查找。在开发模式下必须记录缺失翻译键的警告日志，在生产模式下返回键名或回退语言翻译。

#### Scenario: 翻译键缺失时回退 / Fallback when translation key is missing

- **GIVEN** 当前语言为 zh-CN / The current language is zh-CN
- **WHEN** 请求的翻译键在 zh-CN 中不存在 / The requested translation key does not exist in zh-CN
- **THEN** 自动回退到 en-US 查找 / Automatically falls back to en-US for lookup
- **AND** 如果 en-US 中存在则返回该翻译 / Returns that translation if it exists in en-US

#### Scenario: 所有语言都缺失翻译 / All languages missing translation

- **GIVEN** 翻译键在所有语言中都不存在 / The translation key does not exist in any language
- **WHEN** 调用 t('missing.key') / Calling t('missing.key')
- **THEN** 返回键名 'missing.key' / Returns the key name 'missing.key'
- **AND** 开发模式下记录警告日志 / Logs a warning in development mode

### Requirement: 性能要求 / Performance Requirements

The internationalization implementation MUST NOT significantly impact application performance. Language switching response time MUST be less than 100ms, application initial load time increase MUST NOT exceed 10%, and memory usage increase MUST NOT exceed 100KB. Translation resources SHOULD use an on-demand loading strategy.

国际化实现不得显著影响应用性能。语言切换响应时间必须小于 100ms，应用初始加载时间增加不得超过 10%，内存占用增加不得超过 100KB。翻译资源应使用按需加载策略。

#### Scenario: 快速切换语言 / Fast language switching

- **GIVEN** 应用已加载翻译资源 / The application has loaded translation resources
- **WHEN** 用户切换语言 / The user switches language
- **THEN** 界面在 100ms 内完成更新 / The interface completes updating within 100ms
- **AND** 无明显卡顿 / No noticeable lag

#### Scenario: 初始加载性能 / Initial load performance

- **GIVEN** 应用启动 / The application starts
- **WHEN** i18next 初始化并加载翻译资源 / i18next initializes and loads translation resources
- **THEN** 总加载时间增加不超过 10% / Total load time increase does not exceed 10%
- **AND** 内存占用增加不超过 100KB / Memory usage increase does not exceed 100KB
