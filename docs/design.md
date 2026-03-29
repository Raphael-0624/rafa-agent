# Rafa Agent 系统设计方案

**版本**: 1.0
**日期**: 2026-03-29
**状态**: 已确认，待实施

---

## 1. 概述

将当前 Agent Assistant 升级为完整的自主 Agent 系统 "Rafa"，具备：
- 联网搜索能力
- 自适应智能级别的任务执行
- 内置技能系统
- 实时状态展示

---

## 2. 核心架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Chat Input  │  │ Message List│  │ Status Bar / Options    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Server (Express)                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Agent Controller                       │ │
│  │  POST /api/chat → Intent Classifier → Task Planner        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Agent Loop Engine                      │ │
│  │  while (task.incomplete):                                 │ │
│  │    step = planner.nextStep()                              │ │
│  │    result = toolRegistry.execute(step.tool, step.params)  │ │
│  │    memory.add(result)                                     │ │
│  │    if needClarify(): return clarifyQuestion()             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Tool Registry                          │ │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐       │ │
│  │  │ web_search│ │code_exec │ │file_read│ │file_write│       │ │
│  │  └─────────┘ └──────────┘ └─────────┘ └──────────┘       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户消息 → Intent分类 → 任务复杂度判断
    ↓
简单 ─────────────────→ 直接生成回答
    ↓
中等 ─────────────────→ 调用搜索工具 → 整合回答
    ↓
复杂 ─────────────────→ 生成步骤计划 → 循环执行 → 可选澄清
```

---

## 3. 模块详细设计

### 3.1 Intent 分类器

**输入**: 用户消息 + 对话历史
**输出**: 任务复杂度级别 + 是否需要搜索

```typescript
interface IntentResult {
  level: 'simple' | 'medium' | 'complex';
  needsSearch: boolean;
  needsClarification: boolean;
  suggestedTools: string[];
}
```

**分类规则**:
- **simple**: 问候、常识、数学计算
- **medium**: 需要实时信息（天气、新闻、股价）
- **complex**: 多步骤任务、规划、分析、创作

### 3.2 任务规划器

**输入**: 任务描述 + 当前步骤结果
**输出**: 步骤列表或下一步操作

```typescript
interface TaskPlan {
  steps: Step[];
  currentStep: number;
  status: 'planning' | 'executing' | 'clarifying' | 'completed';
}

interface Step {
  id: string;
  type: 'search' | 'code' | 'read' | 'write' | 'analyze' | 'clarify';
  description: string;
  params: Record<string, any>;
  result?: any;
}
```

### 3.3 Agent 循环

```typescript
async function agentLoop(task: Task, context: Context): Promise<Response> {
  const plan = await planner.createPlan(task, context);

  for (const step of plan.steps) {
    // 发送状态更新
    emitStatus(`正在${step.description}...`);

    // 执行工具
    const result = await toolRegistry.execute(step.type, step.params);

    // 检查是否需要澄清
    if (step.type === 'clarify') {
      return createClarifyResponse(step.options);
    }

    // 更新记忆
    context.addStepResult(step, result);
  }

  // 生成最终回答
  return generateResponse(context);
}
```

### 3.4 技能系统（Phase 1）

#### 3.4.1 web_search

```typescript
interface WebSearchTool {
  name: 'web_search';
  description: '搜索互联网获取实时信息';
  parameters: {
    query: string;      // 搜索关键词
    count?: number;     // 返回结果数，默认 5
    recency?: string;   // 时间过滤: 'day' | 'week' | 'month' | 'year'
  };
  returns: {
    results: SearchResult[];
  };
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}
```

**实现**: 调用 Bing Search API / Google Custom Search / SerpAPI

#### 3.4.2 code_execute

```typescript
interface CodeExecuteTool {
  name: 'code_execute';
  description: '执行 Python/JavaScript 代码进行计算或数据处理';
  parameters: {
    language: 'python' | 'javascript';
    code: string;
    timeout?: number;   // 默认 30s
  };
  returns: {
    output: string;
    error?: string;
    executionTime: number;
  };
}
```

**实现**: 沙箱执行（vm2 / isolated-vm）

#### 3.4.3 file_read / file_write

```typescript
interface FileReadTool {
  name: 'file_read';
  parameters: {
    path: string;
    encoding?: string;
  };
}

interface FileWriteTool {
  name: 'file_write';
  parameters: {
    path: string;
    content: string;
    append?: boolean;
  };
}
```

**限制**: 只能访问指定工作目录

### 3.5 澄清机制

当 Agent 需要更多信息时，返回选项卡片：

```typescript
interface ClarifyResponse {
  type: 'clarify';
  question: string;
  options: Option[];
  allowCustomInput: boolean;  // 是否允许用户直接输入
}

interface Option {
  id: string;
  label: string;
  value: string;
}
```

**示例**:
```json
{
  "type": "clarify",
  "question": "请问您想去哪个城市旅游？",
  "options": [
    { "id": "beijing", "label": "北京", "value": "北京" },
    { "id": "shanghai", "label": "上海", "value": "上海" },
    { "id": "hangzhou", "label": "杭州", "value": "杭州" }
  ],
  "allowCustomInput": true
}
```

---

## 4. 状态展示设计

### 4.1 状态类型

```typescript
type AgentStatus =
  | { type: 'thinking'; message: '正在思考...' }
  | { type: 'searching'; message: '正在搜索 {query}...'; progress?: number }
  | { type: 'analyzing'; message: '正在分析结果...' }
  | { type: 'planning'; message: '正在规划任务步骤...' }
  | { type: 'executing'; message: '正在执行任务 ({current}/{total})...' }
  | { type: 'coding'; message: '正在编写代码...' }
  | { type: 'clarifying'; message: '需要更多信息...' }
  | { type: 'generating'; message: '正在生成回答...' }
  | null;
```

### 4.2 UI 表现

单行状态条，位于输入框上方，实时更新：

```
┌────────────────────────────────────────┐
│  ● 正在搜索 "北京天气"...              │  ← 状态条（动画点 + 文字）
├────────────────────────────────────────┤
│                                        │
│  用户: 今天北京天气怎么样？            │
│                                        │
│  Rafa: [回答内容]                      │
│                                        │
├────────────────────────────────────────┤
│  [输入框]                    [发送]    │
└────────────────────────────────────────┘
```

---

## 5. API 设计

### 5.1 流式响应格式

```
event: status
data: {"type": "searching", "message": "正在搜索..."}

event: status
data: {"type": "analyzing", "message": "正在分析..."}

event: clarify
data: {"question": "请问...", "options": [...]}

event: content
data: {"content": "北京今天..."}

event: done
data: {}
```

### 5.2 消息类型扩展

```typescript
type MessageType =
  | 'user'           // 用户消息
  | 'assistant'      // Agent 最终回答
  | 'status'         // 状态更新
  | 'clarify'        // 需要澄清
  | 'step'           // 单步结果（可选，用于展示中间过程）
  | 'error';         // 错误信息
```

---

## 6. 实现阶段

### Phase 1: 基础 Agent 框架
- [ ] 重构后端目录结构（agent/目录）
- [ ] Intent 分类器
- [ ] 基础 Agent Loop
- [ ] 状态流式传输

### Phase 2: 联网搜索
- [ ] web_search 技能
- [ ] Bing/Google API 接入
- [ ] 搜索结果整合

### Phase 3: 自我循环
- [ ] 任务规划器
- [ ] 多步骤执行
- [ ] 澄清机制
- [ ] 选项卡片 UI

### Phase 4: 扩展技能
- [ ] code_execute 技能
- [ ] file_read/write 技能
- [ ] 工具注册表

### Phase 5: 优化
- [ ] 上下文记忆管理
- [ ] 错误处理与重试
- [ ] 性能优化

---

## 7. 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express |
| AI | 阿里云 DashScope (Anthropic API) |
| 搜索 | Bing Search API / SerpAPI |
| 代码执行 | isolated-vm |
| 流式传输 | Server-Sent Events (SSE) |

---

## 8. 安全考虑

1. **代码执行**: 沙箱环境，限制网络访问
2. **文件操作**: 限制在工作目录内
3. **搜索 API**: 限流保护
4. **Prompt 注入**: 输入过滤与验证

---

**设计确认**: 用户已确认
**下一步**: 编写详细实施计划
