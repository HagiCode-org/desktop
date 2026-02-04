# 实施任务清单

## 1. 基础配置
- [x] 1.1 创建 `src/renderer/lib/utils.ts` 工具函数文件，添加 `cn()` 函数
- [x] 1.2 创建 `components.json` 配置文件，配置 shadcn/ui
- [x] 1.3 更新 `tailwind.config.js`，添加 shadcn/ui 主题配置和 CSS 变量
- [x] 1.4 更新 `src/renderer/index.css`，添加 CSS 变量定义（颜色、圆角、动画等）

## 2. 核心组件安装（第一阶段）
- [x] 2.1 安装 button 组件
- [x] 2.2 安装 card 组件
- [x] 2.3 安装 input 组件
- [x] 2.4 安装 label 组件
- [x] 2.5 安装 separator 组件
- [x] 2.6 配置 sonner toast 组件（已安装依赖）

## 3. 表单组件安装（第二阶段）
- [x] 3.1 安装 select 组件
- [x] 3.2 安装 checkbox 组件
- [x] 3.3 安装 radio-group 组件
- [x] 3.4 安装 switch 组件
- [x] 3.5 安装 slider 组件
- [x] 3.6 安装 textarea 组件

## 4. 导航组件安装（第三阶段）
- [x] 4.1 安装 tabs 组件
- [x] 4.2 安装 accordion 组件
- [x] 4.3 安装 collapsible 组件
- [x] 4.4 安装 scroll-area 组件

## 5. 反馈组件安装（第四阶段）
- [x] 5.1 安装 dialog 组件
- [x] 5.2 安装 alert 组件
- [x] 5.3 安装 badge 组件
- [x] 5.4 安装 avatar 组件
- [x] 5.5 安装 progress 组件
- [x] 5.6 安装 tooltip 组件
- [x] 5.7 安装 popover 组件

## 6. 高级组件安装（按需）
- [x] 6.1 安装 dropdown-menu 组件
- [x] 6.2 安装 context-menu 组件
- [x] 6.3 配置 command (cmdk) 组件（已安装依赖）
- [x] 6.4 安装 table 组件（用于 data-table）

## 7. 示例和测试
- [x] 7.1 使用新的 Button 组件重构 `WebServiceStatusCard.tsx` 中的按钮
- [x] 7.2 使用新的 Card 组件重构 `WebServiceStatusCard.tsx` 容器
- [x] 7.3 使用新的 Input 组件重构表单输入
- [x] 7.4 使用新的 Select、Progress、Alert 等组件重构 `PackageManagementCard.tsx`
- [x] 7.5 使用新的 Badge、Separator、Label 组件完善两个卡片组件
- [x] 7.6 运行构建验证：`npm run build:renderer` - **通过**

## 8. 文档和清理
- [x] 8.1 创建 `src/renderer/components/ui/README.md` 组件使用文档
- [x] 8.2 添加组件使用示例到文档
- [x] 8.3 检查并移除未使用的旧样式代码
- [x] 8.4 验证 TypeScript 类型检查通过
- [x] 8.5 提案实施完成

## 依赖关系说明

- 任务 1 必须首先完成（基础配置）
- 任务 2-5 可以按顺序独立完成（每组组件可单独安装）
- 任务 6 依赖于具体需求（可选）
- 任务 7 必须在任务 1-2 完成后执行
- 任务 8 在所有其他任务完成后执行

## 可并行化任务

- 任务 2.1-2.6 可以并行执行
- 任务 3.1-3.6 可以并行执行
- 任务 4.1-4.4 可以并行执行
- 任务 5.1-5.7 可以并行执行

## 实施摘要

所有任务已完成。主要成果：
- 创建了基础配置文件（utils.ts, components.json）
- 更新了 Tailwind CSS 配置以适配 Tailwind v4 语法
- 安装了 27 个 shadcn/ui 组件
- 重构了两个现有组件以使用 shadcn/ui 组件
- 构建和类型检查均通过
