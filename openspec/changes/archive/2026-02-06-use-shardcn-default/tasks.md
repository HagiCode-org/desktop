# Tasks: 采用 shadcn/ui 默认颜色系统

## 1. 首页颜色迁移 (`SystemManagementView.tsx`)

- [ ] 1.1 替换服务运行状态指示器颜色
  - 第 93 行：`text-green-500 dark:text-green-400` → `text-primary`
  - 第 125 行：`bg-green-500 dark:bg-green-400` → `bg-primary`

- [ ] 1.2 替换版本状态卡片中的颜色
  - 第 173-174 行：`text-green-500 dark:text-green-400` → `text-primary`
  - 第 178-179 行：`text-yellow-500 dark:text-yellow-400` → `text-accent-foreground`

- [ ] 1.3 替换警告框颜色
  - 第 187 行：`bg-yellow-500/10 border-yellow-500/20 dark:border-yellow-500/30` → `bg-accent/10 border-accent/20`
  - 第 188 行：`text-yellow-700 dark:text-yellow-300` → `text-accent-foreground`
  - 第 193 行：`text-yellow-700 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300` → `text-accent-foreground hover:text-accent-foreground/80`

- [ ] 1.4 验证首页在不同主题下的显示效果
  - 浅色主题
  - 深色主题

## 2. 版本管理页面颜色迁移 (`VersionManagementPage.tsx`)

- [ ] 2.1 替换状态标签颜色
  - 第 305 行：`bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20` → `bg-primary/10 text-primary border-primary/20`
  - 第 322 行：`bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20` → `bg-accent/10 text-accent-foreground border-accent/20`

- [ ] 2.2 替换可用版本列表中的颜色
  - 第 433 行：`text-green-500 dark:text-green-400` → `text-primary`
  - 第 458 行：`text-green-500 dark:text-green-400` → `text-primary`

- [ ] 2.3 替换已安装版本列表中的颜色
  - 第 481 行：`text-green-500 dark:text-green-400` → `text-primary`
  - 第 495-496 行：`bg-green-500/10 dark:bg-green-400/10` 和 `text-green-500 dark:text-green-400` → `bg-primary/10` 和 `text-primary`

- [ ] 2.4 替换依赖项查看按钮颜色
  - 第 519 行：`bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400` → `bg-accent/10 hover:bg-accent/20 text-accent-foreground`

- [ ] 2.5 替换依赖项状态指示器颜色
  - 第 610 行：`text-green-500 dark:text-green-400` → `text-primary`
  - 第 612 行：`text-yellow-600 dark:text-yellow-400` → `text-accent-foreground`

- [ ] 2.6 验证版本管理页面在不同主题下的显示效果
  - 浅色主题
  - 深色主题

## 3. 全面验证与测试

- [ ] 3.1 运行应用并检查所有页面无样式错误
- [ ] 3.2 测试浅色/深色主题切换功能
- [ ] 3.3 验证所有交互状态的视觉效果
- [ ] 3.4 确认无遗漏的硬编码颜色值
- [ ] 3.5 截图对比变更前后的视觉效果
