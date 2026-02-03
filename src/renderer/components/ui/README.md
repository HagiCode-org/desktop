# shadcn/ui 组件使用文档

本目录包含从 [shadcn/ui](https://ui.shadcn.com/) 导入的组件。这些组件基于 Radix UI 和 Tailwind CSS 构建，提供了一组可访问的、可定制的高质量 UI 组件。

## 安装的组件

### 核心组件
- `button` - 按钮组件，支持多种变体（default、destructive、outline、secondary、ghost、link）
- `card` - 卡片容器组件
- `input` - 输入框组件
- `label` - 表单标签组件
- `separator` - 分隔线组件
- `sonner` - Toast 通知组件

### 表单组件
- `select` - 下拉选择组件
- `checkbox` - 复选框组件
- `radio-group` - 单选按钮组组件
- `switch` - 开关组件
- `slider` - 滑块组件
- `textarea` - 多行文本输入组件

### 导航组件
- `tabs` - 标签页组件
- `accordion` - 手风琴组件
- `collapsible` - 可折叠容器组件
- `scroll-area` - 自定义滚动区域组件

### 反馈组件
- `dialog` - 对话框组件
- `alert` - 警告提示组件
- `badge` - 徽章组件
- `avatar` - 头像组件
- `progress` - 进度条组件
- `tooltip` - 工具提示组件
- `popover` - 弹出框组件

### 高级组件
- `dropdown-menu` - 下拉菜单组件
- `context-menu` - 右键菜单组件
- `command` - 命令面板组件（基于 cmdk）
- `table` - 表格组件

## 使用方法

### 导入组件

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
```

### Button 组件示例

```tsx
import { Button } from '@/components/ui/button';

function MyComponent() {
  return (
    <div className="flex gap-2">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  );
}
```

### Card 组件示例

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>卡片标题</CardTitle>
        <CardDescription>卡片描述信息</CardDescription>
      </CardHeader>
      <CardContent>
        <p>卡片内容</p>
      </CardContent>
    </Card>
  );
}
```

### Input 组件示例

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function MyComponent() {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">邮箱</Label>
      <Input id="email" type="email" placeholder="请输入邮箱" />
    </div>
  );
}
```

### Alert 组件示例

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

function MyComponent() {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>错误</AlertTitle>
      <AlertDescription>操作失败，请重试。</AlertDescription>
    </Alert>
  );
}
```

### Badge 组件示例

```tsx
import { Badge } from '@/components/ui/badge';

function MyComponent() {
  return (
    <div className="flex gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  );
}
```

### Select 组件示例

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

function MyComponent() {
  return (
    <div className="space-y-2">
      <Label htmlFor="select">选择选项</Label>
      <Select>
        <SelectTrigger id="select">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">选项 1</SelectItem>
          <SelectItem value="2">选项 2</SelectItem>
          <SelectItem value="3">选项 3</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

## 工具函数

项目包含一个 `cn()` 工具函数，用于合并 Tailwind CSS 类名：

```tsx
import { cn } from '@/lib/utils';

function MyComponent({ className }: { className?: string }) {
  return (
    <div className={cn('base-class', 'additional-class', className)}>
      Content
    </div>
  );
}
```

## 主题定制

组件使用 Tailwind CSS 主题变量进行样式定制。主题变量在 `src/renderer/index.css` 中定义。

### 颜色变量

- `--color-background-*` - 背景色
- `--color-foreground-*` - 前景色
- `--color-primary-*` - 主色调
- `--color-secondary-*` - 次要色
- `--color-muted-*` - 柔和色
- `--color-accent-*` - 强调色
- `--color-destructive-*` - 危险色
- `--color-border-*` - 边框色
- `--color-input-*` - 输入框边框色
- `--color-ring-*` - 焦点环色

### 语义化颜色

组件使用语义化的颜色类名：
- `bg-background` / `text-foreground` - 背景和前景
- `bg-primary` / `text-primary-foreground` - 主色
- `bg-muted` / `text-muted-foreground` - 柔和色
- `border-border` - 边框
- `ring-ring` - 焦点环

## 图标库

项目使用 [lucide-react](https://lucide.dev/) 作为图标库：

```tsx
import { CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';

function MyComponent() {
  return (
    <div className="flex gap-2">
      <CheckCircle2 className="w-5 h-5 text-green-500" />
      <AlertCircle className="w-5 h-5 text-red-500" />
      <Info className="w-5 h-5 text-blue-500" />
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );
}
```

## 在现有组件中使用

### 重构前（使用原生 Tailwind 类）

```tsx
const OldComponent = () => {
  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-gray-700 shadow-xl">
      <h2 className="text-xl font-semibold mb-4">标题</h2>
      <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-lg">
        按钮
      </button>
    </div>
  );
};
```

### 重构后（使用 shadcn/ui 组件）

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const NewComponent = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>标题</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>按钮</Button>
      </CardContent>
    </Card>
  );
};
```

## 添加新组件

要添加新的 shadcn/ui 组件，使用以下命令：

```bash
npx shadcn@latest add <component-name>
```

例如：
```bash
npx shadcn@latest add sheet
npx shadcn@latest add toast
```

## 注意事项

1. **Tailwind CSS v4**: 项目使用 Tailwind CSS v4，配置语法与 v3 有所不同。主题变量使用 `@theme` 块定义。

2. **路径别名**: 组件使用 `@/` 别名导入，例如 `@/components/ui/button`。

3. **TypeScript**: 所有组件都包含完整的 TypeScript 类型定义。

4. **无障碍性**: 基于 Radix UI 的组件具有良好的键盘导航和屏幕阅读器支持。

5. **可定制性**: 可以通过修改 `tailwind.config.js` 和 `index.css` 来自定义组件样式。

## 参考资源

- [shadcn/ui 官方文档](https://ui.shadcn.com/)
- [Radix UI 文档](https://www.radix-ui.com/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [lucide-react 图标库](https://lucide.dev/)
