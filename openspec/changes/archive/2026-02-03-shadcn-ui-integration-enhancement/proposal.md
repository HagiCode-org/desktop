# Change: 完善 shadcn/ui 组件库集成

## Why

当前 Hagicode Desktop 应用使用了 React 19 + TypeScript 5.7 + Tailwind CSS 4.0，并已安装 shadcn/ui 相关依赖（`class-variance-authority`、`tailwind-merge`、`cmdk`、`lucide-react`、`sonner` 等），但缺少标准的 shadcn/ui 组件实现。现有的组件（如 `PackageManagementCard.tsx`）使用原生 Tailwind 类名编写，导致代码冗长、难以维护，且缺少统一的组件库标准。

引入完整的 shadcn/ui 组件库可以：
- 提供高质量的、可定制的 UI 组件
- 减少重复的样式代码，提高开发效率
- 确保设计一致性和可访问性
- 利用现有依赖（`class-variance-authority`、`tailwind-merge`、`lucide-react` 等）

## What Changes

### 1. 创建 components.json 配置文件
- 初始化 shadcn/ui 配置文件
- 配置组件路径为 `src/renderer/components/ui`
- 配置 Tailwind CSS 和 TypeScript 路径别名
- 设置样式文件路径

### 2. 安装常用 shadcn/ui 组件
按优先级添加以下组件：

**核心组件（第一阶段）：**
- button - 按钮组件
- card - 卡片容器
- input - 输入框
- label - 表单标签
- separator - 分隔线
- toast (sonner) - 通知提示

**表单组件（第二阶段）：**
- select - 下拉选择
- checkbox - 复选框
- radio-group - 单选组
- switch - 开关
- slider - 滑块
- textarea - 多行输入

**导航组件（第三阶段）：**
- tabs - 标签页
- accordion - 手风琴
- collapsible - 折叠容器
- scroll-area - 滚动区域

**反馈组件（第四阶段）：**
- dialog - 对话框
- alert - 警告提示
- badge - 徽章
- avatar - 头像
- progress - 进度条
- tooltip - 工具提示
- popover - 弹出框

**高级组件（按需添加）：**
- dropdown-menu - 下拉菜单
- context-menu - 右键菜单
- command (cmdk) - 命令面板
- data-table - 数据表格

### 3. 配置 Tailwind CSS
- 添加 shadcn/ui 所需的 CSS 变量（颜色、圆角、动画等）
- 配置自定义主题颜色
- 添加 dark mode 支持

### 4. 更新全局样式
- 在 `src/renderer/index.css` 中添加 CSS 变量定义
- 配置字体（使用 `@fontsource-variable/jetbrains-mono` 作为等宽字体）

### 5. 创建工具函数
- 创建 `src/renderer/lib/utils.ts` 用于 `cn()` 函数（合并 Tailwind 类名）

## Impact

### 影响的规范
- **新增**: `ui-components` - UI 组件库能力规范

### 影响的代码
- **新增**: `src/renderer/lib/utils.ts` - 工具函数
- **新增**: `src/renderer/components/ui/*` - UI 组件目录
- **修改**: `src/renderer/index.css` - 添加 CSS 变量
- **修改**: `tailwind.config.js` - 添加主题配置
- **新增**: `components.json` - shadcn/ui 配置文件

### 不影响的功能
- 现有的 `PackageManagementCard.tsx` 和 `WebServiceStatusCard.tsx` 组件将继续正常工作
- 可以渐进式地迁移到新组件库

## Benefits

### 开发效率
- 预制的组件减少从零开始编写样式的时间
- 统一的组件接口和属性
- 减少代码重复

### 设计一致性
- 统一的设计语言（颜色、间距、圆角等）
- 可访问性内置（ARIA 属性、键盘导航）
- 响应式设计支持

### 可维护性
- 组件集中管理，便于全局样式调整
- 类型安全的 TypeScript 支持
- 清晰的组件文档和示例

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|----------|
| 组件体积增加 | 使用 tree-shaking，只导入使用的组件 |
| 与现有样式冲突 | 使用 CSS 变量和 scoped 样式隔离 |
| 学习曲线 | 组件文档完善，与现有 Tailwind 类名兼容 |
| 版本兼容性 | 锁定 shadcn/ui 组件版本，定期更新测试 |

## Migration Strategy

采用渐进式迁移策略：

1. **第一阶段（基础设置）**：配置 shadcn/ui，安装核心组件
2. **第二阶段（新功能）**：新开发的 UI 使用 shadcn/ui 组件
3. **第三阶段（渐进迁移）**：逐步重构现有组件
4. **第四阶段（优化）**：移除未使用的旧代码和样式

## Success Criteria

- [ ] `components.json` 配置文件创建完成
- [ ] 第一阶段核心组件（button, card, input, label, separator, toast）安装完成
- [ ] CSS 变量和主题配置正确应用
- [ ] 示例组件使用 shadcn/ui 组件重构
- [ ] 构建成功，无类型错误
- [ ] 运行时无控制台错误或警告
