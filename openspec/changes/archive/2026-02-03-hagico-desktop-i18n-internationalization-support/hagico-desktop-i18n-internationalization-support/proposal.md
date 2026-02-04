# Change: Hagico Desktop 国际化支持实施

## Why

当前 Hagico Desktop 应用程序仅支持英文界面，限制了中文用户的使用体验。应用程序已集成 i18next 依赖但未启用，缺少系统性的国际化架构和多语言支持，无法满足全球用户的本地化需求。

## What Changes

- 创建 i18next 框架初始化和配置
- 建立命名空间化的翻译资源文件结构（common、components、pages）
- 实现 Redux i18n state 管理
- 提供简体中文（zh-CN）完整翻译
- 开发语言选择器 UI 组件
- 集成 electron-store 持久化用户语言偏好
- 迁移所有 UI 组件使用 useTranslation Hook

## UI Design Changes

### 语言选择器组件

```
┌─────────────────────────────────────────┐
│ 语言 / Language                          │
│ ┌─────────────────────────────────────┐ │
│ │ 🇨🇳 简体中文 (Simplified Chinese)   │ │
│ │   ▼                                 │ │
│ └─────────────────────────────────────┘ │
│   🇨🇳 简体中文 (Simplified Chinese)     │
│   🇺🇸 English (English)                 │
└─────────────────────────────────────────┘
```

## Impact

- Affected specs: internationalization (新增)
- Affected code:
  - `src/renderer/i18n/` (新增目录)
  - `src/renderer/store/slices/i18nSlice.ts` (新增)
  - `src/renderer/components/settings/LanguageSelector.tsx` (新增)
  - 所有包含 UI 文本的 React 组件 (修改)

## 背景与问题

### 当前状态

- **技术栈基础**：项目已集成 `i18next` (v25.7.3) 和 `react-i18next` (v16.5.1) 依赖包
- **语言限制**：应用程序界面完全基于硬编码英文文本
- **组件规模**：项目包含约 29 个 React 组件文件，大量 UI 文本需要本地化
- **用户群体**：非英语用户面临使用门槛，影响应用程序的普及和易用性

### 痛点问题

1. **用户体验限制**：中文用户无法使用母语界面，降低使用效率
2. **开发维护困难**：硬编码文本散布在各个组件中，难以统一管理和更新
3. **扩展性不足**：缺少架构层面的多语言支持，难以快速添加新语言
4. **缺少语言切换机制**：用户无法自由选择界面语言

## 解决方案

### 技术架构设计

采用模块化、可扩展的国际化架构：

```
src/renderer/i18n/
├── index.ts                    # i18n 实例初始化和配置
├── config.ts                   # i18next 配置选项
└── locales/
    ├── zh-CN/                  # 简体中文
    │   ├── common.json        # 通用文本
    │   ├── components.json    # 组件文本
    │   └── pages.json         # 页面文本
    └── en-US/                  # 英文（预留）
        ├── common.json
        ├── components.json
        └── pages.json

src/renderer/store/
└── slices/i18nSlice.ts         # 语言状态管理

src/renderer/components/
└── settings/
    └── LanguageSelector.tsx    # 语言选择器组件
```

### 核心功能实现

#### 1. i18next 初始化与配置

**配置要点**：
- 默认语言：`zh-CN`（简体中文）
- 回退语言：`en-US`（英文）
- 命名空间策略：按功能域划分（common、components、pages）
- 语言检测：优先从用户设置中读取，否则使用系统语言

**技术实现**：
```typescript
// src/renderer/i18n/config.ts
export const i18nConfig = {
  lng: 'zh-CN',
  fallbackLng: 'en-US',
  defaultNS: 'common',
  ns: ['common', 'components', 'pages'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
};
```

#### 2. 翻译资源体系

**命名空间划分**：

- **common.json**：通用 UI 文本
  - 按钮标签（确认、取消、保存等）
  - 状态标识（加载中、成功、失败等）
  - 常用词汇（是、否、删除、编辑等）

- **components.json**：组件特定文本
  - 卡片标题和描述
  - 表单标签和占位符
  - 错误和提示信息

- **pages.json**：页面级文本
  - 页面标题和导航
  - 页面描述和帮助文本

**翻译键命名规范**：
```
namespace.category.specificItem

示例：
components.packageManagement.cardTitle
components.packageManagement.installStatus
pages.settings.languageSelector.label
```

#### 3. Redux 状态集成

**状态结构**：
```typescript
interface I18nState {
  currentLanguage: string;      // 当前语言代码
  availableLanguages: Language[]; // 可用语言列表
  isLoading: boolean;
}

interface Language {
  code: string;       // zh-CN, en-US
  name: string;       // 简体中文, English
  nativeName: string; // 简体中文, English
}
```

**核心 Actions**：
- `setCurrentLanguage(language: string)` - 设置当前语言
- `loadAvailableLanguages()` - 加载可用语言列表

#### 4. 组件集成策略

**改造方式**：
- 使用 `useTranslation` Hook 替换硬编码文本
- 保持组件结构和逻辑不变，仅替换文本内容
- 支持动态语言切换，无需重启应用

**示例改造**：
```typescript
// 改造前
<CardTitle>Package Management</CardTitle>

// 改造后
const { t } = useTranslation('components');
<CardTitle>{t('packageManagement.cardTitle')}</CardTitle>
```

#### 5. 语言切换与持久化

**语言选择器组件**：
- 位置：设置页面或应用顶部工具栏
- UI 形式：下拉选择器（使用 shadcn/ui Select 组件）
- 实时切换：选择后立即更新界面语言

**持久化存储**：
- 使用 `electron-store` 保存用户语言偏好
- 存储路径：`appSettings.language`
- 应用启动时自动加载上次选择的语言

## 实施计划

### 阶段划分

**阶段 1：基础设施搭建**（优先级：高）
- 创建 i18n 配置和实例
- 建立翻译资源文件结构
- 实现 Redux 状态管理

**阶段 2：文本资源提取**（优先级：高）
- 系统化提取所有硬编码文本
- 创建翻译键并翻译为简体中文
- 按命名空间组织翻译资源

**阶段 3：组件迁移**（优先级：中）
- 逐个组件替换硬编码文本
- 确保所有 UI 文本支持动态切换
- 验证组件功能不受影响

**阶段 4：语言切换功能**（优先级：中）
- 开发语言选择器组件
- 集成到设置界面
- 实现持久化存储

**阶段 5：测试与优化**（优先级：低）
- 全面测试语言切换功能
- 优化翻译质量
- 性能测试和优化

### 组件迁移优先级

**第一批**（核心功能组件）：
- PackageManagementCard
- WebServiceStatusCard

**第二批**（常用 UI 组件）：
- 各类对话框和弹窗
- 表单组件

**第三批**（次要功能）：
- 帮助和提示文本
- 日志和调试信息

## 影响评估

### 用户体验影响

**正面影响**：
- 中文用户获得原生语言界面，显著提升易用性
- 降低学习成本，提高操作效率
- 增强应用程序的本地化亲和力

**潜在风险**：
- 翻译质量不当可能导致语义偏差
- 语言切换可能产生短暂的界面闪烁

### 开发流程影响

**开发规范变化**：
- 新功能开发必须遵循国际化最佳实践
- 所有新增 UI 文本必须使用翻译键
- 代码审查需检查国际化合规性

**维护成本**：
- 每次文本变更需更新所有语言的翻译资源
- 需要建立翻译资源同步机制
- 增加翻译质量保证流程

### 性能影响

**正面影响**：
- 按命名空间加载翻译资源，减少初始加载时间
- 支持语言包的按需加载和缓存

**潜在风险**：
- 首次加载新的语言资源可能产生轻微延迟
- 大量翻译键可能增加内存占用（约 50-100KB）

### 代码质量影响

**改进**：
- 减少硬编码，提升代码可维护性
- 建立统一的文本管理规范
- 提高代码的可测试性

**挑战**：
- 翻译键的命名和管理需要严格的规范
- 组件代码可读性可能因抽象层而略微降低

## 后续扩展路径

### 短期扩展（1-3 个月）

1. **英文支持**：添加 en-US 完整翻译
2. **繁体中文**：支持 zh-TW（台湾地区）
3. **自动语言检测**：根据操作系统语言自动选择

### 中期扩展（3-6 个月）

1. **更多语言**：日语、韩语等亚洲语言
2. **动态语言包**：支持从服务器下载和更新翻译
3. **翻译管理工具**：开发可视化的翻译资源管理界面

### 长期扩展（6-12 个月）

1. **RTL 语言支持**：支持阿拉伯语等从右到左的语言
2. **主进程本地化**：Electron 主进程和系统级通知的本地化
3. **社区翻译**：建立社区贡献翻译的机制

## 风险与缓解措施

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| i18next 配置复杂导致集成困难 | 中 | 低 | 参考 i18next 官方最佳实践，逐步集成 |
| 翻译资源管理混乱 | 高 | 中 | 建立严格的命名规范和代码审查流程 |
| 性能退化 | 中 | 低 | 性能基准测试，按需加载语言资源 |
| 与现有 Redux store 冲突 | 低 | 低 | 模块化设计，隔离 i18n state |

### 翻译质量风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 翻译不准确或语义偏差 | 高 | 中 | 多轮审校，用户反馈机制 |
| 技术术语不一致 | 中 | 中 | 建立术语表和翻译指南 |
| 上下文缺失导致翻译困难 | 中 | 高 | 在翻译键中添加上下文注释 |

### 项目进度风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 组件迁移工作量超出预期 | 中 | 中 | 分阶段实施，优先处理核心组件 |
| 翻译资源提取遗漏 | 低 | 中 | 自动化扫描工具辅助 + 人工审查 |

## 成功标准

### 功能完整性

- [ ] 所有 UI 组件支持多语言
- [ ] 语言切换功能正常工作
- [ ] 用户语言偏好正确持久化
- [ ] 应用重启后恢复上次选择的语言

### 翻译质量

- [ ] 所有界面文本完整翻译为简体中文
- [ ] 翻译准确、自然、符合中文表达习惯
- [ ] 技术术语使用一致
- [ ] 无明显的翻译错误或拼写问题

### 性能标准

- [ ] 语言切换响应时间 < 100ms
- [ ] 初始加载时间增加 < 10%
- [ ] 内存占用增加 < 100KB

### 代码质量

- [ ] 所有硬编码文本已移除
- [ ] 翻译键命名规范统一
- [ ] 代码审查通过国际化检查项
- [ ] 无 TypeScript 类型错误

### 用户体验

- [ ] 语言切换操作直观易用
- [ ] 界面布局在中文显示下无溢出或错位
- [ ] 用户反馈积极

## 依赖关系

### 外部依赖

- **i18next** (v25.7.3)：已集成，无需额外安装
- **react-i18next** (v16.5.1)：已集成，无需额外安装
- **electron-store** (v10.0.0)：已集成，用于持久化语言偏好

### 内部依赖

- **Redux store**：需要扩展以支持语言状态管理
- **shadcn/ui 组件**：需要使用 Select、Dialog 等组件构建语言选择器
- **Electron 主进程**：需要提供 IPC 通道用于读写语言设置（可选）

### 约束条件

- 必须保持向后兼容，不破坏现有功能
- 不能影响应用程序的启动性能
- 翻译资源文件必须包含在分发包中
- 遵循项目现有的代码规范和架构模式

## 附录

### 参考资料

- [i18next 官方文档](https://www.i18next.com/)
- [react-i18next 文档](https://react.i18next.com/)
- [Electron 国际化最佳实践](https://www.electronjs.org/docs/latest/tutorial/locales)

### 术语对照表

| 英文 | 简体中文 |
|------|----------|
| Package | 包 |
| Install | 安装 |
| Version | 版本 |
| Status | 状态 |
| Settings | 设置 |
| Language | 语言 |
| Download | 下载 |
| Progress | 进度 |
| Error | 错误 |
| Success | 成功 |

### 关键决策记录

1. **默认语言选择**：选择简体中文而非英文作为默认语言，因为目标用户群体以中文用户为主
2. **命名空间策略**：采用功能域划分而非文件路径划分，便于维护和查找
3. **持久化方案**：使用 electron-store 而非文件系统，确保跨平台兼容性和数据安全
