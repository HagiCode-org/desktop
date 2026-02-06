# Change: 采用 shadcn/ui 默认颜色系统

## Status: ExecutionCompleted

## Why

当前首页和版本管理页面组件使用大量硬编码颜色值（如 `text-green-500`、`bg-yellow-500/10`、`text-destructive`），未能充分利用 `index.css` 中已配置的 shadcn/ui 设计令牌。这导致主题切换时颜色不一致，代码维护性差，且未充分利用 shadcn/ui 的设计系统优势。

## What Changes

- 将 `SystemManagementView.tsx` 中的硬编码颜色替换为 shadcn/ui 语义化类名
- 将 `VersionManagementPage.tsx` 中的硬编码颜色替换为 shadcn/ui 语义化类名
- 统一使用 `--primary`、`--secondary`、`--accent`、`--destructive` 等语义颜色变量
- 确保浅色/深色主题切换时颜色协调一致

### 首页 (`SystemManagementView.tsx`)

| 当前 | 目标 |
|------|------|
| `bg-green-500/10 text-green-600 dark:text-green-400` | `bg-primary/10 text-primary` |
| `text-green-500 dark:text-green-400` | `text-primary` |
| `bg-yellow-500/10 text-yellow-700` | `bg-accent/10 text-accent-foreground` |
| `text-yellow-500 dark:text-yellow-400` | `text-accent-foreground` |
| `bg-yellow-500/10 border-yellow-500/20` | `bg-accent/10 border-accent/20` |

### 版本管理页面 (`VersionManagementPage.tsx`)

| 当前 | 目标 |
|------|------|
| `bg-green-500/10 text-green-600 dark:text-green-400` | `bg-primary/10 text-primary` |
| `bg-yellow-500/10 text-yellow-600 dark:text-yellow-400` | `bg-accent/10 text-accent-foreground` |
| `text-green-500 dark:text-green-400` | `text-primary` |
| `text-yellow-600 dark:text-yellow-400` | `text-accent-foreground` |
| `bg-green-500/10 dark:bg-green-400/10` | `bg-primary/10` |
| `text-green-500 dark:text-green-400` | `text-primary` |
| `bg-yellow-500/10 hover:bg-yellow-500/20` | `bg-accent/10 hover:bg-accent/20` |
| `text-yellow-600 dark:text-yellow-400` | `text-accent-foreground` |

## Impact

### Affected Specs
- `specs/electron-app/spec.md` - UI 设计令牌使用规范

### Affected Code
- `src/renderer/components/SystemManagementView.tsx`
- `src/renderer/components/VersionManagementPage.tsx`

### Benefits
- **视觉一致性**：所有页面使用统一的设计令牌，主题切换时颜色协调
- **代码可维护性**：通过语义化类名，未来只需修改 `index.css` 即可全局调整
- **开发体验**：新组件开发时可直接使用 shadcn/ui 设计模式
- **无破坏性变更**：仅涉及 CSS 类名替换，不影响组件逻辑和功能

### Risks
- **视觉变化**：颜色可能有细微差异，需团队评审确认
- **回归问题**：需全面测试浅色/深色主题切换

### Migration
- 无需数据迁移
- 无需 API 变更
- 纯前端 CSS 类名替换

## Success Criteria

- [x] 所有硬编码颜色值已替换为 shadcn/ui 语义化类名
- [x] 不再使用 `green-*`、`yellow-*`、`red-*` 等具体颜色
- [x] 应用运行无样式错误
- [x] 浅色/深色主题切换时颜色协调一致
- [x] 通过完整的 UI 回归测试
