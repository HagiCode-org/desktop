# 完善 i18n 国际化翻译覆盖

## 概述 (Overview)

完善 Hagicode Desktop 应用的国际化 (i18n) 实现，消除硬编码文本，确保所有用户界面元素都支持多语言切换。

## 范围 (Scope)

### 覆盖范围 (In Scope)

1. **硬编码文本国际化**
   - App.tsx 中的硬编码英文文本（标题、状态描述、按钮文本）
   - 其他 .tsx 组件中的硬编码中英文文本
   - 无障碍文本（如 `sr-only` 类的屏幕阅读器文本）

2. **翻译资源完善**
   - 补充 `common.json`、`components.json`、`pages.json` 中缺失的翻译键
   - 确保中英文翻译文件键结构完全一致
   - 为 UI 组件库创建独立的翻译命名空间（如 `ui.json`）

3. **命名空间规范化**
   - 审查所有组件的 `useTranslation` 调用
   - 确保正确声明所需命名空间
   - 在 `i18n/config.ts` 中注册新命名空间

4. **开发体验增强**
   - 建立翻译键命名规范文档
   - 验证 `saveMissing` 和 `missingKeyHandler` 功能正常工作

### 排除范围 (Out of Scope)

- 添加新的语言支持（当前仅支持简体中文和英文）
- 修改 i18next 核心配置逻辑（除非必要）
- 实现翻译键的类型安全（可作为未来增强）

## 影响分析 (Impact Analysis)

### 用户影响

- **正面影响**:
  - 用户切换语言后，所有界面文本将正确显示对应语言
  - 提升多语言用户体验，特别是对中文用户
  - 无障碍功能用户也能获得本地化的屏幕阅读器文本

- **风险**:
  - 无明显用户风险

### 代码影响

- **修改的文件**:
  - `src/renderer/App.tsx` - 替换硬编码文本为翻译函数调用
  - `src/renderer/components/ui/dialog.tsx` - 本地化无障碍文本
  - `src/renderer/i18n/config.ts` - 可能添加 `ui` 命名空间
  - 所有 `src/renderer/i18n/locales/{language}/*.json` - 补充翻译键

- **新增的文件**:
  - `src/renderer/i18n/locales/{language}/ui.json` - UI 组件库翻译资源

- **估计工作量**: 小到中等（约 4-6 小时）

### 技术影响

- **依赖性**: 依赖现有的 i18next 基础设施，无需新增依赖
- **性能**: 无性能影响
- **测试**: 需要在两种语言环境下验证界面显示

## 实现策略 (Implementation Strategy)

### 核心原则

1. **最小化变更**: 仅修改必要的代码，避免重构
2. **增量实现**: 先处理用户可见的高优先级文本，再处理辅助性文本
3. **验证驱动**: 每次修改后立即验证翻译效果

### 关键决策

| 决策点 | 选择方案 | 理由 |
|--------|----------|------|
| UI 组件库翻译组织 | 创建独立的 `ui` 命名空间 | 保持关注点分离，便于维护 |
| 翻译键命名 | 采用 `category.item` 格式 | 与现有命名风格一致，简洁明了 |
| 硬编码文本识别 | 使用正则表达式搜索 + 人工审查 | 平衡自动化和准确性 |

## 成功标准 (Success Criteria)

### 功能验收标准

- [x] App.tsx 中所有用户可见文本都通过 `t()` 函数获取
- [x] 切换语言后，所有界面文本立即更新为目标语言
- [x] 控制台无 "Missing translation key" 警告（开发环境）
- [x] 中英文翻译文件的键结构完全一致（使用 diff 工具验证）

### 质量验收标准

- [x] 所有翻译文本在两种语言下都能完整显示（无截断）
- [x] 无障碍文本（`sr-only`）已正确国际化
- [x] 代码通过 TypeScript 类型检查
- [x] 现有功能不受影响（启动服务、停止服务、包管理等）

## 依赖关系 (Dependencies)

### 前置依赖

- 现有的 i18next 配置已正常工作
- 翻译资源目录结构已建立

### 后续影响

- 为将来添加新语言（如繁体中文、日文等）奠定基础
- 为实现类型安全的翻译键提供参考

## 风险与缓解措施 (Risks & Mitigations)

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 翻译质量不佳（机器翻译） | 中 | 低 | 使用人工翻译或社区审核 |
| 遗漏某些硬编码文本 | 低 | 中 | 系统性搜索 + QA 验证 |
| 命名空间使用不当导致回退 | 低 | 低 | 充分测试，参考现有组件用法 |
| 中英文键不一致 | 低 | 中 | 使用 diff 工具验证结构一致性 |

## 参考材料 (References)

- [i18next 官方文档](https://www.i18next.com/)
- [react-i18next 使用指南](https://react.i18next.com/)
- 项目现有 i18n 配置: `src/renderer/i18n/config.ts`
- Web Content Accessibility Guidelines (WCAG) - 无障碍文本最佳实践

## 相关变更 (Related Changes)

- 与 `2026-02-03-hagico-desktop-i18n-internationalization-support/` 变更相关联
- 可能与 `package-management-service-startup-ux-improvement/` 变更有交集（按钮文本翻译）
