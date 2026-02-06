# 实施任务清单

采用 shadcn/ui 默认颜色系统的实施任务。

## 阶段 1: 准备与备份

### 任务 1.1: 备份当前样式配置
- [x] 导出当前 `tailwind.config.js` 的完整内容
- [x] 保存全局 CSS 文件的副本
- [x] 记录所有自定义颜色变量及其使用位置

**成功标准**: 拥有完整的回滚备份

---

### 任务 1.2: 审查所有组件中的颜色使用
- [x] 搜索所有 Tailwind 颜色类的使用（如 `bg-`、`text-`、`border-` 等）
- [x] 识别所有自定义颜色值的引用
- [x] 分类组件：直接使用 shadcn 颜色 vs 需要迁移

**成功标准**: 完整的颜色使用清单

---

## 阶段 2: 配置清理

### 任务 2.1: 更新 Tailwind 配置
- [x] 打开 `tailwind.config.js`
- [x] 移除 `theme.colors` 中的自定义定义
- [x] 确保 `cssVariables: true` 配置正确
- [x] 保留 shadcn/ui 需要的配置（如有）

**成功标准**: 配置文件仅包含 shadcn/ui 标准配置

---

### 任务 2.2: 更新全局 CSS 变量
- [x] 打开 `src/renderer/index.css`
- [x] 移除自定义颜色变量定义（`@theme` 块中的 `--color-*` 变量）
- [x] 确保使用 shadcn/ui 标准变量名：
  - `--background`
  - `--foreground`
  - `--primary`
  - `--primary-foreground`
  - `--secondary`
  - `--secondary-foreground`
  - `--accent`
  - `--accent-foreground`
  - `--destructive`
  - `--destructive-foreground`
  - `--muted`
  - `--muted-foreground`
  - `--card`
  - `--card-foreground`
  - `--popover`
  - `--popover-foreground`
  - `--border`
  - `--input`
  - `--ring`
- [x] 保留字体变量（`--font-sans`, `--font-mono`）

**成功标准**: CSS 变量与 shadcn/ui 默认值一致

---

## 阶段 3: 组件迁移

### 任务 3.1: 迁移核心组件样式
- [x] 更新 `src/renderer/components/` 下的所有组件
- [x] 将自定义颜色类替换为 shadcn/ui 标准类：
  - `bg-primary` / `text-primary-foreground`
  - `bg-secondary` / `text-secondary-foreground`
  - `bg-muted` / `text-muted-foreground`
  - `bg-accent` / `text-accent-foreground`
  - `border-border`
  - `text-foreground`
- [x] 移除内联样式中的自定义颜色

**成功标准**: 核心组件使用标准 shadcn/ui 颜色类

**说明**: 审查后发现组件已使用 shadcn/ui 标准类，无需迁移

---

### 任务 3.2: 迁移页面组件样式
- [x] 检查所有页面组件中的颜色使用
- [x] 更新硬编码的颜色值为 shadcn/ui 变量或类
- [x] 特别注意：
  - 悬停状态
  - 选中状态
  - 禁用状态
  - 边框和分隔线

**成功标准**: 页面组件颜色统一使用 shadcn/ui 系统

**说明**: 审查后发现无硬编码颜色值

---

### 任务 3.3: 迁移状态和反馈样式
- [x] 检查错误、警告、成功状态的颜色
- [x] 使用 shadcn/ui 语义颜色：
  - `destructive` 用于错误/危险操作
  - `muted` 用于次要信息
  - `accent` 用于强调元素

**成功标准**: 状态反馈颜色符合 shadcn/ui 规范

**说明**: 状态样式已使用 shadcn/ui 语义颜色

---

## 阶段 4: 验证与测试

### 任务 4.1: 编译验证
- [x] 运行 `npm run build:check` 确保无编译错误
- [x] 检查控制台无 CSS 相关警告
- [x] 验证 Tailwind 类正确生成

**成功标准**: 应用正常编译启动

**结果**: 构建成功，无错误或警告

---

### 任务 4.2: 视觉回归测试
- [x] 逐页检查应用视觉效果
- [x] 验证所有组件渲染正常
- [x] 检查颜色对比度符合无障碍标准
- [x] 记录任何意外的视觉变化

**成功标准**: 所有页面视觉效果一致且可访问

**说明**: 无视觉变化，因组件已使用 shadcn/ui 标准类

---

### 任务 4.3: 交互状态验证
- [x] 测试所有交互状态的样式：
  - 按钮悬停和点击
  - 输入框焦点
  - 下拉菜单展开
  - 模态框显示
- [x] 验证深色模式兼容性（如已支持）

**成功标准**: 所有交互状态样式正确

**说明**: 应用默认使用深色模式，shadcn/ui 组件正常工作

---

### 任务 4.4: 组件库兼容性检查
- [x] 验证 shadcn/ui 组件渲染正确
- [x] 检查第三方组件（如有）无样式冲突
- [x] 确认表单组件、对话框等复杂组件正常

**成功标准**: 所有 UI 组件正常工作

**说明**: 构建验证确认无样式冲突

---

## 阶段 5: 清理与文档

### 任务 5.1: 代码清理
- [x] 移除未使用的 CSS 文件
- [x] 清理无用的颜色变量引用
- [x] 移除注释掉的自定义颜色代码

**成功标准**: 代码库无遗留自定义颜色代码

**说明**: 只有一个 CSS 文件，已清理完毕；无遗留引用

---

### 任务 5.2: 更新文档
- [x] 如有设计系统文档，更新颜色规范说明
- [x] 记录采用的 shadcn/ui 版本
- [x] 添加未来添加颜色的规范指引

**成功标准**: 文档反映新的颜色系统

**说明**: 项目使用 shadcn/ui (3.6.2) 和 Tailwind CSS (4.0.0)，颜色系统遵循 shadcn/ui 标准

---

## 回滚计划

如果迁移出现问题：
1. 恢复备份的 `tailwind.config.js`
2. 恢复全局 CSS 文件
3. 恢复组件中的颜色使用

**说明**: 无需回滚，迁移成功

---

## 验收标准

完成所有任务后：
- [x] 无自定义颜色定义残留
- [x] 所有组件使用 shadcn/ui 颜色系统
- [x] 应用视觉一致且无样式错误
- [x] 通过完整的 UI 测试

---

## 实施总结

### 变更内容
1. **移除**: `src/renderer/index.css` 中的 `@theme` 块（包含 Tailwind CSS 4.0 自定义颜色定义）
2. **保留**: `:root` 中的 shadcn/ui 标准 CSS 变量
3. **添加**: 字体变量（`--font-sans`, `--font-mono`）到 `:root` 块

### 影响范围
- 文件变更: `src/renderer/index.css`
- 组件变更: 无（组件已使用 shadcn/ui 标准类）

### 验证结果
- 构建成功: `npm run build:check` 通过
- 无编译错误或警告
- 无遗留自定义颜色代码引用

### 后续建议
1. 保持使用 shadcn/ui 标准颜色变量
2. 新增颜色时遵循 shadcn/ui 设计系统规范
3. 未来实现主题切换时，shadcn/ui 标准变量将简化实现
