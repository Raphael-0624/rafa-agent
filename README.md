# Rafa Agent 🤖

基于 React + Node.js 的 AI 智能助手，支持流式输出和 Agent 工作流。

## ✨ 功能特点

- 🤖 **多 LLM 支持**: Anthropic / 阿里云 DashScope / OpenAI 兼容格式
- ⚡ **流式输出**: SSE 实时推送，打字机效果
- 🧠 **Agent 架构**: 意图分类 → 任务规划 → 工具执行 → 生成回复
- 🔍 **搜索集成**: 支持 Tavily / Serper / DuckDuckGo 搜索
- 💬 **智能澄清**: 当意图不明时，主动询问用户确认
- 📝 **Markdown 渲染**: 代码块、表格、列表完整支持
- 🎨 **深色主题**: 现代化 UI 设计

## 🏗️ 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  LLM API    │
│  (React)    │◄────│  (Express)  │◄────│(Anthropic)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   Agent Core   │
                    │ - Intent       │
                    │ - Task Planner │
                    │ - Tool Registry│
                    └───────────────┘
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- API Key (Anthropic / 阿里云 DashScope)

### 安装

```bash
# 克隆仓库
git clone https://github.com/Rockelbel/rafa-agent.git
cd rafa-agent

# 安装依赖
npm run install:all
```

### 配置

编辑 `server/.env`:

```env
# 使用阿里云 DashScope (推荐)
ANTHROPIC_AUTH_TOKEN=your-dashscope-api-key
ANTHROPIC_MODEL=kimi-k2.5

# 或使用 OpenAI
# OPENAI_API_KEY=your-key
# OPENAI_MODEL=gpt-4

# 搜索 API (可选)
TAVILY_API_KEY=your-key
SERPER_API_KEY=your-key
```

### 开发模式

```bash
# 同时启动前后端
npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:3001

### 生产部署

```bash
# 构建前端
npm run build

# 启动服务器
cd server && npm start
```

访问 http://localhost:3001/agent

## 🔌 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/chat` | 流式对话 (SSE) |
| GET | `/api/debug/logs` | 调试日志 |

## 📝 License

MIT
