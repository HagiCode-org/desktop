# ui-components Specification (Delta)

## ADDED Requirements

### Requirement: Shadcn/UI 基础配置

系统 MUST 提供 shadcn/ui 的基础配置，包括组件路径、样式配置和工具函数。

#### Scenario: utils.ts 工具函数可用

**Given** 应用已正确配置
**When** 任何组件导入 `cn()` 函数
**Then** 该函数正确合并 Tailwind CSS 类名
**And** 支持条件类名和类型推断

#### Scenario: CSS 变量已定义

**Given** 应用加载 `index.css`
**When** 渲染任何页面
**Then** 所有 shadcn/ui CSS 变量（颜色、圆角、间距等）已定义
**And** 变量值与 Tailwind 配置一致

---

### Requirement: 核心组件可用性

系统 MUST 提供核心 UI 组件：button、card、input、label、separator、toast。

#### Scenario: Button 组件渲染

**Given** 开发者导入 Button 组件
**When** 渲染 `<Button>Click me</Button>`
**Then** 显示样式正确的按钮
**And** 支持 variant 属性（default、destructive、outline、secondary、ghost、link）
**And** 支持 size 属性（default、sm、lg、icon）

#### Scenario: Card 组件容器

**Given** 开发者使用 Card、CardHeader、CardTitle、CardContent 组件
**When** 组合渲染卡片内容
**Then** 显示带有正确样式和间距的卡片容器

#### Scenario: Input 表单输入

**Given** 开发者渲染 `<Input />` 组件
**When** 用户输入文本
**Then** 输入框显示正确的边框、焦点样式和占位符
**And** 支持所有原生 input 属性

#### Scenario: Toast 通知提示

**Given** 应用配置了 Toaster 组件
**When** 调用 `toast()` 函数
**Then** 显示正确的通知提示
**And** 支持不同类型（success、error、info、warning）

---

### Requirement: 表单组件完整性

系统 SHALL 提供完整的表单组件：select、checkbox、radio-group、switch、slider、textarea。

#### Scenario: Select 下拉选择

**Given** 开发者使用 Select、SelectTrigger、SelectContent、SelectItem 组件
**When** 用户点击选择器
**Then** 显示下拉选项列表
**And** 选择后正确更新值

#### Scenario: Switch 开关切换

**Given** 开发者渲染 `<Switch />` 组件
**When** 用户点击开关
**Then** 开关状态切换
**And** 触发 onChange 回调

---

### Requirement: 导航和布局组件

系统 SHALL 提供导航和布局组件：tabs、accordion、collapsible、scroll-area。

#### Scenario: Tabs 标签页切换

**Given** 开发者使用 Tabs、TabsList、TabsTrigger、TabsContent 组件
**When** 用户点击标签
**Then** 切换到对应内容区域
**And** 激活标签高亮显示

#### Scenario: ScrollArea 滚动区域

**Given** 内容超出容器高度
**When** 使用 ScrollArea 组件包裹
**Then** 显示自定义滚动条
**And** 滚动条样式与主题一致

---

### Requirement: 反馈和覆盖组件

系统 SHALL 提供反馈和覆盖组件：dialog、alert、badge、avatar、progress、tooltip、popover。

#### Scenario: Dialog 对话框

**Given** 开发者使用 Dialog、DialogTrigger、DialogContent 组件
**When** 触发器被点击
**Then** 显示模态对话框
**And** 背景内容变暗
**And** 支持关闭操作（ESC、点击外部、关闭按钮）

#### Scenario: Tooltip 工具提示

**Given** 开发者使用 Tooltip、TooltipTrigger、TooltipContent 组件
**When** 鼠标悬停在触发器上
**Then** 显示工具提示内容
**And** 延迟后自动隐藏

---

### Requirement: 组件类型安全

所有 UI 组件 MUST 提供完整的 TypeScript 类型定义。

#### Scenario: 组件属性类型检查

**Given** 开发者使用任何 UI 组件
**When** 传入不匹配的属性类型
**Then** TypeScript 编译器报错
**And** IDE 提供属性自动完成

#### Scenario: 组件 Ref 转发

**Given** 组件支持 ref 转发
**When** 通过 ref 访问组件 DOM
**Then** 返回正确的 DOM 元素类型

---

### Requirement: 组件可访问性

所有 UI 组件 MUST 遵循 WCAG 2.1 AA 级可访问性标准。

#### Scenario: 键盘导航支持

**Given** 用户使用键盘导航
**When** 使用 Tab、Enter、Escape、方向键
**Then** 所有交互组件正确响应
**And** 焦点指示器清晰可见

#### Scenario: 屏幕阅读器支持

**Given** 用户使用屏幕阅读器
**When** 遍历 UI 组件
**Then** 所有组件有正确的 ARIA 属性
**And** 状态变化被正确通知

---

### Requirement: 主题和样式定制

系统 MUST 支持通过 CSS 变量定制组件主题。

#### Scenario: Dark Mode 支持

**Given** 应用配置了 dark mode
**When** 切换到深色主题
**Then** 所有 UI 组件使用深色样式
**And** 过渡动画平滑

#### Scenario: 自定义主题颜色

**Given** 开发者修改 CSS 变量中的颜色值
**When** 重新加载应用
**Then** 所有组件使用新颜色渲染
