# 实施任务清单

移除视图切换淡入淡出动画的有序任务列表。

---

## 任务列表

### 1. 代码准备
**状态:** `pending` | **预计工作量:** 5 分钟

- [ ] 创建功能分支：`git checkout -b feature/remove-view-transition-animation`
- [ ] 验证当前分支：确保在 `feature/multiplerelease` 基础上创建

---

### 2. 修改 App.tsx 移除视图动画
**状态:** `pending` | **预计工作量:** 10 分钟
**文件:** `src/renderer/App.tsx`

- [ ] 定位主内容区域的 `AnimatePresence` 和 `motion.div` 组件（约第 73-91 行）
- [ ] 移除 `AnimatePresence` 包装标签
- [ ] 将 `motion.div` 替换为普通 `div` 元素
- [ ] 删除以下动画属性：
  - `key={currentView}`
  - `initial={{ opacity: 0, y: 20, scale: 0.98 }}`
  - `animate={{ opacity: 1, y: 0, scale: 1 }}`
  - `exit={{ opacity: 0, y: -20, scale: 0.98 }}`
  - `transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}`
- [ ] 保留容器样式类：`className="container mx-auto px-4 py-8 min-h-screen"`
- [ ] 保留外层 div 的边距过渡：`className="ml-64 transition-all duration-500 ease-out"`

**预期变更：**
```tsx
<!-- 之前 -->
<AnimatePresence mode="wait">
  <motion.div
    key={currentView}
    initial={{ opacity: 0, y: 20, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -20, scale: 0.98 }}
    transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    className="container mx-auto px-4 py-8 min-h-screen"
  >
    {currentView === 'system' && <SystemManagementView />}
    ...
  </motion.div>
</AnimatePresence>

<!-- 之后 -->
<div className="container mx-auto px-4 py-8 min-h-screen">
  {currentView === 'system' && <SystemManagementView />}
  ...
</div>
```

---

### 3. 清理未使用的导入（可选）
**状态:** `pending` | **预计工作量:** 5 分钟
**文件:** `src/renderer/App.tsx`

- [ ] 检查 `AnimatePresence` 和 `motion` 是否在文件中还有其他用途
- [ ] 如无其他用途，从导入语句中移除：
  ```diff
  - import { AnimatePresence, motion } from 'motion/react';
  + import { AnimatePresence, motion } from 'motion/react'; // 暂时保留，SidebarNavigation 仍在使用
  ```
- [ ] **注意**：由于 `SidebarNavigation.tsx` 仍使用 `motion/react`，项目级别不应移除依赖，仅清理当前文件的导入即可

---

### 4. 本地功能测试
**状态:** `pending` | **预计工作量:** 15 分钟

- [ ] 启动开发服务器：`npm run dev` 或 `pnpm dev`
- [ ] 测试所有视图切换：
  - [ ] System Management → Version Management
  - [ ] Version Management → License Management
  - [ ] License Management → System Management
  - [ ] 所有其他视图组合
- [ ] 验证视图内容立即显示（无淡入淡出延迟）
- [ ] 验证无视觉闪烁或布局跳动
- [ ] 验证侧边栏折叠/展开时的边距过渡仍然正常

---

### 5. 代码审查与优化
**状态:** `pending` | **预计工作量:** 5 分钟

- [ ] 检查代码格式是否符合项目规范
- [ ] 确认无 console 错误或警告
- [ ] 验证 TypeScript 类型检查通过：`npm run type-check` 或类似命令

---

### 6. 提交变更
**状态:** `pending` | **预计工作量:** 5 分钟

- [ ] 添加变更到暂存区：`git add src/renderer/App.tsx`
- [ ] 创建提交：
  ```
  git commit -m "feat: remove view transition fade animation

  - Remove AnimatePresence and motion.div wrapper from main content area
  - Replace with standard div for instant view switching
  - Preserve sidebar margin transition effect

  This change improves perceived responsiveness when navigating between
  views in the sidebar navigation."
  ```

---

### 7. 合并与清理
**状态:** `pending` | **预计工作量:** 5 分钟

- [ ] 推送功能分支：`git push origin feature/remove-view-transition-animation`
- [ ] 创建 Pull Request 到 `feature/multiplerelease` 分支
- [ ] 在 PR 描述中引用此 OpenSpec 提案
- [ ] 等待代码审查和合并
- [ ] 合并后删除功能分支

---

## 验收检查清单

在标记任务完成前，确认以下所有项目：

### 功能完整性
- [ ] 所有四个视图（system、web、version、license）可正常切换
- [ ] 视图切换时内容立即显示
- [ ] 无 0.4 秒动画延迟

### 视觉一致性
- [ ] 侧边栏宽度变化时的过渡效果保持正常
- [ ] 侧边栏导航项活跃状态指示器正常
- [ ] 无页面闪烁或布局错位

### 代码质量
- [ ] 无 TypeScript 类型错误
- [ ] 无运行时控制台错误
- [ ] 代码格式符合项目规范

### 性能
- [ ] 视图切换响应主观感觉即时（< 100ms）

---

## 回滚计划

如果需要回滚此变更：

1. **紧急回滚**：使用 `git revert <commit-hash>` 撤销提交
2. **手动回滚**：恢复 `AnimatePresence` 和 `motion.div` 代码结构
3. **验证**：确认动画效果恢复正常后重新部署

---

## 依赖关系

```
┌─────────────────┐
│ 1. 代码准备      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. 修改 App.tsx  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. 清理导入      │ (可选)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. 本地测试      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. 代码审查      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. 提交变更      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 7. 合并与清理    │
└─────────────────┘
```

**总预计工作量:** 45-50 分钟
**风险等级:** 低
**可并行任务:** 无（任务需顺序执行）
