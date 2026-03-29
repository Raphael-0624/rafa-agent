# Agent Assistant

AI Agent 智能助手，支持流式输出和 Markdown 渲染。

## 功能特点

- 🤖 支持多种 AI API（Anthropic/阿里云 DashScope、OpenAI）
- ⚡ 流式输出，实时显示回答
- 📝 Markdown 渲染，支持代码高亮
- 🎨 现代化深色主题 UI
- 📱 响应式设计
- 🔒 后端代理，保护 API Key

## 技术栈

- **前端**: React + TypeScript + Vite + Tailwind CSS
- **后端**: Node.js + Express
- **AI**: Anthropic API / 阿里云 DashScope（兼容 OpenAI 格式）

## 快速开始

### 安装依赖

```bash
# 根目录安装
npm run install:all
```

### 配置 API

编辑 `server/.env`：

```env
# 使用阿里云 DashScope
API_TYPE=anthropic
ANTHROPIC_AUTH_TOKEN=your-token
ANTHROPIC_MODEL=kimi-k2.5
```

### 启动开发环境

```bash
npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:3001

### 生产部署

```bash
# 构建前端
npm run build

# 启动生产服务器
cd server && npm start
```

## API 端点

- `GET /api/health` - 健康检查
- `GET /api/config` - 获取当前 API 配置
- `POST /api/chat` - 流式对话

## 部署

项目已配置 nginx 反向代理，访问路径：`/agent`
