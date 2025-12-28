# typli-2api: 奇美拉视觉 - 图像大师

## 项目概述

**typli-2api** 是一个基于 **Cloudflare Worker** 的单文件高性能代理服务。核心使命：**打破Typli.ai的免费使用限制，并将非标准的AI服务接口完美转换为全球开发者最熟悉的OpenAI API格式**。

只需一键部署到Cloudflare，您就能拥有一个功能强大的私有API网关，享受包括Grok-4、GPT-5.2等顶级模型的无限次（理论上）聊天与文生图能力！

<p align="center">
  <img src="https://img.shields.io/badge/版本-2.4.1-purple" alt="版本">
  <img src="https://img.shields.io/badge/代号-Image_Maestro-blue" alt="代号">
  <img src="https://img.shields.io/badge/协议-Apache_2.0-success" alt="协议">
  <img src="https://img.shields.io/badge/状态-Production_Ready-brightgreen" alt="状态">
</p>

> **二次开发说明**：本项目基于 [lza6/typli-2api-cfwork](https://github.com/lza6/typli-2api-cfwork) 二次开发，感谢原作者的开源贡献。

---

## 核心特性

| 特性 | 描述 |
|------|------|
| **无限续杯** | 每次请求自动生成全新Session ID，绕过1000词限制 |
| **全能模型** | 支持Grok-4、GPT-5.2等15+聊天模型和9+文生图模型 |
| **双协议兼容** | 同时支持 OpenAI API 和 Gemini API 格式 |
| **流式/非流式** | 支持流式(SSE)和非流式响应，兼容各类客户端 |
| **会话持久化** | 使用 Cloudflare KV 存储会话历史，支持多轮对话记忆 |
| **图片高级参数** | 支持尺寸、数量、质量、风格等参数控制 |
| **模型名映射** | 简化模型名称，如 `gpt-5.2` 自动映射到 `openai/gpt-5.2` |
| **开发者驾驶舱** | 内置全功能中文调试界面，实时测试监控 |

---

## 版本更新日志

### v2.4.1 - 当前版本

**修复：**
- **修复 nano-banana 模型错误**：这些模型不支持额外参数（width/height/aspect_ratio），现已自动跳过
- **增强额度绕过**：优化随机 Cookie 生成，添加更多随机字段和来源

**已知限制：**
- `gemini-2.5-flash-image` 和 `gemini-3-pro-image-preview` 模型额度要求较高（300 credits），可能偶发额度不足错误
- 建议优先使用 `flux-2`、`flux-2-pro` 等模型

### v2.4.0 (Image Maestro)

**新增功能：**
- **图片高级参数控制**：支持尺寸、数量、质量、风格等参数
  - OpenAI 格式：`n`, `size`, `quality`, `style`, `response_format`
  - Gemini 格式：`sampleCount`, `aspectRatio`, `negativePrompt`, `seed`
- **专用图片生成端点**：`/v1/images/generations` 返回标准 OpenAI 格式
- **多图生成**：单次请求可生成 1-4 张图片
- **新增模型**：`openai/gpt-5.2` (显示名: `gpt-5.2`)

### v2.3.0 (Session Keeper)

**新增功能：**
- **会话持久化**：使用 Cloudflare KV 存储对话历史
- **会话管理 API**：`GET/DELETE /v1/sessions?session_id=xxx`
- **多种会话标识方式**：支持 `session_id`、`user` 字段和 `X-Session-ID` 请求头

### v2.2.1 - v2.2.x

**新增功能：**
- **Gemini API 兼容**：支持 `/v1beta/models/{model}:generateContent` 等端点
- **双重鉴权**：同时支持 `Authorization: Bearer xxx` 和 `?key=xxx` 两种方式
- **非流式响应**：修复 new-api 等项目的兼容性问题
- **模型名称映射**：简化模型调用，如 `gpt-5` → `openai/gpt-5`
- **图片限流绕过**：自动生成随机 Cookie 绕过图片生成额度限制

---

## 支持的模型

### 聊天模型

| 显示名 | 实际调用名 |
|--------|------------|
| `gpt-5.2` | `openai/gpt-5.2` |
| `gpt-5` | `openai/gpt-5` |
| `gpt-5-mini` | `openai/gpt-5-mini` |
| `gpt-4o` | `openai/gpt-4o` |
| `gpt-4o-mini` | `openai/gpt-4o-mini` |
| `grok-4-fast` | `xai/grok-4-fast` |
| `grok-4-fast-reasoning` | `xai/grok-4-fast-reasoning` |
| `claude-3-5-haiku-latest` | `anthropic/claude-haiku-4-5` |
| `gemini-2.5-flash` | `google/gemini-2.5-flash` |
| `deepseek-r1` | `deepseek/deepseek-reasoner` |
| `deepseek-v3` | `deepseek/deepseek-chat` |

### 图片模型

| 显示名 | 实际调用名 |
|--------|------------|
| `flux-2` | `fal-ai/flux-2` |
| `flux-2-pro` | `fal-ai/flux-2-pro` |
| `flux-2-realism` | `fal-ai/flux-2-lora-gallery/realism` |
| `gemini-2.5-flash-image` | `fal-ai/nano-banana` |
| `gemini-3-pro-image-preview` | `fal-ai/nano-banana-pro` |
| `sd-v3.5-large` | `fal-ai/stable-diffusion-v35-large` |
| `recraft-v3` | `fal-ai/recraft/v3/text-to-image` |
| `imagineart-1.5` | `imagineart/imagineart-1.5-preview/text-to-image` |
| `doubao-seedream-4.5` | `fal-ai/bytedance/seedream/v4.5/text-to-image` |

---

## 快速开始

### 1. 部署到 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **创建应用程序** → **创建Worker**
3. 将 `worker.js` 文件内容完整粘贴到编辑器
4. 点击「部署」

### 2. 配置环境变量（可选）

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| `API_MASTER_KEY` | `1` | API认证密钥，建议修改为复杂密钥 |

### 3. 启用会话持久化（可选）

**步骤1：创建 KV 命名空间**
- 进入 数据和存储库 → KV → 创建命名空间
- 命名空间名称填写: `SESSIONS`

**步骤2：绑定 KV 到 Worker**
- 进入你的 Worker → 绑定 → KV命名空间
- 点击「Add binding」
- Variable name 填写: `SESSIONS`
- KV namespace 选择刚创建的命名空间
- 点击「Save」

---

## API 端点

### OpenAI 兼容端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/models` | GET | 获取模型列表 |
| `/v1/chat/completions` | POST | 聊天补全（支持聊天和图片模型） |
| `/v1/images/generations` | POST | 图片生成（OpenAI 标准格式响应） |
| `/v1/sessions` | GET/DELETE | 会话管理 |

### Gemini 兼容端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1beta/models/{model}:generateContent` | POST | 内容生成 |
| `/v1beta/models/{model}:streamGenerateContent` | POST | 流式内容生成 |
| `/v1beta/models/{model}:predict` | POST | 图片生成（Imagen格式） |

---

## 使用示例

### 聊天请求

```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.2",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

### 图片生成（OpenAI 格式）

```bash
curl -X POST https://your-worker.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flux-2",
    "prompt": "一只可爱的猫咪",
    "n": 2,
    "size": "1024x1024",
    "quality": "hd"
  }'
```

### 带会话的多轮对话

```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4-fast",
    "session_id": "user123",
    "messages": [{"role": "user", "content": "继续上次的话题"}],
    "stream": true
  }'
```

### Gemini 格式请求

```bash
curl -X POST "https://your-worker.workers.dev/v1beta/models/google/gemini-2.5-flash:generateContent?key=your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "你好"}]}]
  }'
```

---

## 图片参数说明

### 支持的尺寸

| 格式 | 支持值 |
|------|--------|
| OpenAI | `256x256`, `512x512`, `1024x1024`, `1792x1024`, `1024x1792` |
| Gemini | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| 别名 | `square`, `landscape`, `portrait` |

### OpenAI 格式参数

```json
{
  "model": "flux-2",
  "prompt": "描述文本",
  "n": 2,                     // 生成数量 (1-4)
  "size": "1024x1024",        // 尺寸
  "quality": "hd",            // 质量: standard, hd
  "style": "vivid",           // 风格: vivid, natural
  "response_format": "url"    // 响应格式: url, b64_json
}
```

### Gemini 格式参数

```json
{
  "contents": [{"parts": [{"text": "描述文本"}]}],
  "parameters": {
    "sampleCount": 2,         // 生成数量
    "aspectRatio": "16:9",    // 宽高比
    "negativePrompt": "模糊", // 负面提示词
    "seed": 12345             // 随机种子
  }
}
```

---

## 会话管理

### 指定会话标识（三种方式）

```json
// 方式1: 请求体中的 session_id
{ "session_id": "user123", ... }

// 方式2: 请求体中的 user 字段（OpenAI兼容）
{ "user": "user123", ... }

// 方式3: 请求头
Headers: { "X-Session-ID": "user123" }
```

### 管理会话

```bash
# 获取会话历史
curl "https://your-worker.workers.dev/v1/sessions?session_id=user123" \
  -H "Authorization: Bearer your-api-key"

# 清除会话
curl -X DELETE "https://your-worker.workers.dev/v1/sessions?session_id=user123" \
  -H "Authorization: Bearer your-api-key"
```

---

## 客户端配置

### LobeChat

```yaml
- identifier: "typli-proxy"
  name: "Typli Proxy"
  endpoint: "https://your-worker.workers.dev/v1"
  apiKey: "your-api-key"
  models:
    - "gpt-5.2"
    - "grok-4-fast"
    - "flux-2"
```

### NextChat / ChatGPT-Next-Web

```
OPENAI_API_KEY=your-api-key
BASE_URL=https://your-worker.workers.dev
```

### new-api / one-api

添加自定义渠道：
- 类型: OpenAI
- Base URL: `https://your-worker.workers.dev`
- 密钥: `your-api-key`
- 模型: 手动添加需要的模型名

---

## 技术架构

```
用户请求 → Cloudflare Worker → 智能路由
                                  ↓
                    ┌─────────────┴─────────────┐
                    ↓                           ↓
               聊天模型                      图片模型
                    ↓                           ↓
           生成随机Session ID            生成随机Cookie
                    ↓                           ↓
           转发到Typli聊天API          转发到Typli图片API
                    ↓                           ↓
           SSE流式协议转换              获取图片URL
                    ↓                           ↓
           OpenAI格式响应               OpenAI/Markdown格式
                    ↓                           ↓
                    └─────────────┬─────────────┘
                                  ↓
                             返回客户端
```

---

## 配置项说明

在 `worker.js` 文件顶部的 `CONFIG` 对象中可以修改以下配置：

```javascript
const CONFIG = {
  API_MASTER_KEY: "1",           // API密钥，建议修改
  SESSION_ENABLED: true,          // 是否启用会话持久化
  SESSION_TTL: 86400,             // 会话过期时间（秒）
  SESSION_MAX_MESSAGES: 50,       // 每个会话最大消息数
  // ... 更多配置见源码
};
```

---

## 许可证

本项目采用 **Apache License 2.0** 开源协议。

基于 [lza6/typli-2api-cfwork](https://github.com/lza6/typli-2api-cfwork) 二次开发。

---

## 致谢

- 原项目作者: [lza6](https://github.com/lza6)
- 各位贡献者

---

<p align="center">
  <sub>最后更新：2025-12-28 | 版本：2.4.1 | 代号：Image Maestro</sub>
</p>
