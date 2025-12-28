/**
 * =================================================================================
 * 项目: typli-2api (Cloudflare Worker 单文件版)
 * 版本: 2.4.0 (代号: Chimera Vision - Image Maestro)
 * 作者: 首席AI执行官 (Principal AI Executive Officer)
 * 协议: 奇美拉协议 · 综合版 (Project Chimera: Synthesis Edition)
 * 日期: 2025-12-27
 *
 * [核心特性]
 * 1. [无限续杯] 每次请求自动生成全新 Session ID，绕过 1000 词额度限制。
 * 2. [多模态支持] 同时支持 Grok-4 聊天模型与多种文生图模型。
 * 3. [协议转换] 将 Typli 的自定义 SSE 格式与图片生成接口完美转换为 OpenAI 兼容格式。
 * 4. [开发者驾驶舱] 内置全功能中文调试界面，支持聊天与文生图的实时测试与日志监控。
 * 5. [通用流式适配] 所有响应均以流式（SSE）格式返回，完美兼容各类聊天客户端。
 * 6. [会话持久化] 使用 Cloudflare KV 存储会话历史，支持多轮对话上下文记忆。
 * 7. [图片高级参数] 支持尺寸、数量、质量、风格等参数，兼容 OpenAI 和 Gemini 格式。
 *
 * =================================================================================
 * [部署说明 - Cloudflare Dashboard]
 * =================================================================================
 *
 * 1. 基础部署（不含会话持久化）:
 *    - 登录 Cloudflare Dashboard -> Workers & Pages -> 创建 Worker
 *    - 将此文件内容粘贴到编辑器中，点击「部署」
 *    - (可选) 在 Settings -> Variables 中设置 API_MASTER_KEY
 *
 * 2. 启用会话持久化:
 *    步骤1: 创建 KV 命名空间
 *      - 进入 数据和存储库 -> KV -> 创建命名空间
 *      - 命名空间名称填写: SESSIONS
 *
 *    步骤2: 绑定 KV 到 Worker
 *      - 进入你的 Worker -> 绑定 -> KV命名空间
 *      - 点击「Add binding」
 *      - Variable name 填写: SESSIONS
 *      - KV namespace 选择刚创建的命名空间
 *      - 点击「Save」
 *
 * 3. 使用会话功能:
 *    - 在请求中添加 session_id 或 user 字段，或使用 X-Session-ID 请求头
 *    - 示例: {"model":"grok-4-fast","session_id":"user123","messages":[...]}
 *    - 管理会话: GET/DELETE /v1/sessions?session_id=xxx
 *
 * 4. 禁用会话功能:
 *    - 将下方 SESSION_ENABLED 设置为 false，或不配置 KV 绑定
 * =================================================================================
 */

// --- [第一部分: 核心配置 (Configuration-as-Code)] ---
const CONFIG = {
  // 项目元数据
  PROJECT_NAME: "typli-2api",
  PROJECT_VERSION: "2.4.1",

  // 安全配置 (建议在 Cloudflare 环境变量中设置 API_MASTER_KEY)
  API_MASTER_KEY: "1",

  // 上游服务配置
  UPSTREAM_CHAT_URL: "https://typli.ai/api/generators/chat",
  UPSTREAM_IMAGE_URL: "https://typli.ai/api/generators/images",
  ORIGIN_URL: "https://typli.ai",
  REFERER_CHAT_URL: "https://typli.ai/free-no-sign-up-chatgpt",
  REFERER_IMAGE_URL: "https://typli.ai/ai-image-generator",

  // 会话持久化配置 (使用 Cloudflare KV)
  SESSION_ENABLED: true,           // 是否启用会话持久化
  SESSION_TTL: 86400,              // 会话过期时间（秒），默认 24 小时
  SESSION_MAX_MESSAGES: 50,        // 每个会话最大消息数量

  // 图片生成参数配置
  IMAGE_DEFAULTS: {
    n: 1,                          // 默认生成数量
    size: "1024x1024",             // 默认尺寸
    quality: "standard",           // 默认质量: standard, hd
    style: "vivid",                // 默认风格: vivid, natural
    response_format: "url"         // 响应格式: url, b64_json
  },

  // 尺寸映射 (OpenAI格式 -> 宽高比 -> 实际像素)
  SIZE_MAP: {
    // OpenAI 标准尺寸
    "256x256": { width: 256, height: 256, aspectRatio: "1:1" },
    "512x512": { width: 512, height: 512, aspectRatio: "1:1" },
    "1024x1024": { width: 1024, height: 1024, aspectRatio: "1:1" },
    "1792x1024": { width: 1792, height: 1024, aspectRatio: "16:9" },
    "1024x1792": { width: 1024, height: 1792, aspectRatio: "9:16" },
    // Gemini 宽高比格式
    "1:1": { width: 1024, height: 1024, aspectRatio: "1:1" },
    "16:9": { width: 1792, height: 1024, aspectRatio: "16:9" },
    "9:16": { width: 1024, height: 1792, aspectRatio: "9:16" },
    "4:3": { width: 1024, height: 768, aspectRatio: "4:3" },
    "3:4": { width: 768, height: 1024, aspectRatio: "3:4" },
    // 额外支持的尺寸
    "landscape": { width: 1792, height: 1024, aspectRatio: "16:9" },
    "portrait": { width: 1024, height: 1792, aspectRatio: "9:16" },
    "square": { width: 1024, height: 1024, aspectRatio: "1:1" }
  },

  // 聊天模型列表 (来源于抓包与JS分析)
  CHAT_MODELS: [
    "xai/grok-4-fast",
    "xai/grok-4-fast-reasoning",
    "anthropic/claude-haiku-4-5",
    "openai/gpt-5.2",
    "openai/gpt-5",
    "openai/gpt-5-mini",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-reasoner",
    "deepseek/deepseek-chat",
    "grok-4",      // 别名
    "gpt-4o",      // 兼容性别名
    "gpt-3.5-turbo" // 兼容性别名
  ],

  // 绘图模型列表 (来源于 JS Chunk 519972)
  IMAGE_MODELS: [
    "fal-ai/flux-2",
    "fal-ai/flux-2-pro",
    "fal-ai/flux-2-lora-gallery/realism",
    "fal-ai/nano-banana",
    "fal-ai/nano-banana-pro",
    "fal-ai/stable-diffusion-v35-large",
    "fal-ai/recraft/v3/text-to-image",
    "imagineart/imagineart-1.5-preview/text-to-image",
    "fal-ai/bytedance/seedream/v4.5/text-to-image"
  ],

  DEFAULT_CHAT_MODEL: "xai/grok-4-fast",
  DEFAULT_IMAGE_MODEL: "fal-ai/flux-2",

  // Gemini 兼容模型配置
  GEMINI_CHAT_MODELS: ["google/gemini-2.5-flash"],
  GEMINI_IMAGE_MODELS: ["fal-ai/nano-banana", "fal-ai/nano-banana-pro"],

  // 仅支持基本参数的图片模型（不支持 width/height/aspect_ratio 等）
  BASIC_ONLY_IMAGE_MODELS: [
    "fal-ai/nano-banana",
    "fal-ai/nano-banana-pro"
  ],

  // 模型名称映射 (显示名 -> 实际调用名)
  // 用户看到的是显示名，实际请求上游时使用调用名
  MODEL_DISPLAY_MAP: {
    // 聊天模型
    "grok-4-fast": "xai/grok-4-fast",
    "grok-4-fast-reasoning": "xai/grok-4-fast-reasoning",
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
    "gpt-5.2": "openai/gpt-5.2",
    "gpt-5": "openai/gpt-5",
    "gpt-5-mini": "openai/gpt-5-mini",
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gemini-2.5-flash": "google/gemini-2.5-flash",
    "deepseek-r1": "deepseek/deepseek-reasoner",
    "deepseek-v3": "deepseek/deepseek-chat",
    // 兼容性别名 (保持原样)
    "grok-4": "grok-4",
    "gpt-3.5-turbo": "gpt-3.5-turbo",
    // 图片模型
    "flux-2": "fal-ai/flux-2",
    "flux-2-pro": "fal-ai/flux-2-pro",
    "flux-2-realism": "fal-ai/flux-2-lora-gallery/realism",
    "gemini-2.5-flash-image": "fal-ai/nano-banana",
    "gemini-3-pro-image-preview": "fal-ai/nano-banana-pro",
    "sd-v3.5-large": "fal-ai/stable-diffusion-v35-large",
    "recraft-v3": "fal-ai/recraft/v3/text-to-image",
    "imagineart-1.5": "imagineart/imagineart-1.5-preview/text-to-image",
    "doubao-seedream-4.5": "fal-ai/bytedance/seedream/v4.5/text-to-image"
  },

  // 伪装指纹 (严格复刻 Chrome 142)
  BASE_HEADERS: {
    "authority": "typli.ai",
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "content-type": "application/json",
    "origin": "https://typli.ai",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "priority": "u=1, i"
  }
};

// --- [第二部分: Worker 入口与路由] ---
export default {
  async fetch(request, env, ctx) {
    const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;
    // 注入上下文（包含 KV 绑定）
    request.ctx = {
      apiKey,
      kv: env.SESSIONS  // Cloudflare KV 绑定，需要在 wrangler.toml 中配置
    };

    const url = new URL(request.url);

    // 1. CORS 预检
    if (request.method === 'OPTIONS') return handleCorsPreflight();

    // 2. 路由分发
    if (url.pathname === '/') return handleUI(request);
    if (url.pathname.startsWith('/v1/')) return handleApi(request);
    if (url.pathname.startsWith('/v1beta/')) return handleGeminiApi(request);

    return createErrorResponse(`路径未找到: ${url.pathname}`, 404, 'not_found');
  }
};

// --- [第三部分: API 代理逻辑] ---

async function handleApi(request) {
  if (!verifyAuth(request)) return createErrorResponse('Unauthorized', 401, 'unauthorized');

  const url = new URL(request.url);
  const requestId = `req-${crypto.randomUUID()}`;

  switch (url.pathname) {
    case '/v1/models':
      return handleModelsRequest();
    case '/v1/chat/completions':
      return handleChatCompletions(request, requestId);
    case '/v1/images/generations':
      // OpenAI 标准图片生成端点，返回标准格式
      return handleImageGenerations(request, requestId);
    case '/v1/sessions':
      return handleSessionsRequest(request);
    default:
      return createErrorResponse('Not Found', 404, 'not_found');
  }
}

// 鉴权逻辑 (同时支持 OpenAI 和 Gemini 两种鉴权方式)
function verifyAuth(request) {
  const masterKey = request.ctx.apiKey;
  if (masterKey === "1") return true; // 默认密钥 "1" 允许所有请求

  // 方式1: OpenAI 风格 - Authorization: Bearer xxx
  const auth = request.headers.get('Authorization');
  if (auth === `Bearer ${masterKey}`) return true;

  // 方式2: Gemini 风格 - URL 查询参数 ?key=xxx
  const url = new URL(request.url);
  const keyParam = url.searchParams.get('key');
  if (keyParam === masterKey) return true;

  return false;
}

// 模型名称解析：将显示名转换为实际调用名
function resolveModelName(displayName) {
  // 如果在映射表中找到，返回实际调用名
  if (CONFIG.MODEL_DISPLAY_MAP[displayName]) {
    return CONFIG.MODEL_DISPLAY_MAP[displayName];
  }
  // 如果本身就是实际调用名（向后兼容），直接返回
  const allInternalModels = [...CONFIG.CHAT_MODELS, ...CONFIG.IMAGE_MODELS];
  if (allInternalModels.includes(displayName)) {
    return displayName;
  }
  // 否则返回原值（可能是未知模型）
  return displayName;
}

// 模型列表接口 (返回显示名)
function handleModelsRequest() {
  // 获取所有显示名
  const displayNames = Object.keys(CONFIG.MODEL_DISPLAY_MAP);
  const modelsData = {
    object: 'list',
    data: displayNames.map(id => ({
      id: id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'typli-2api',
    })),
  };
  return new Response(JSON.stringify(modelsData), {
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

// 会话管理接口
// GET /v1/sessions?session_id=xxx - 获取会话历史
// DELETE /v1/sessions?session_id=xxx - 清除会话
async function handleSessionsRequest(request) {
  const kv = request.ctx.kv;

  if (!CONFIG.SESSION_ENABLED) {
    return createErrorResponse('会话持久化功能未启用', 400, 'session_disabled');
  }

  if (!kv) {
    return createErrorResponse('KV 存储未配置，请在 wrangler.toml 中配置 SESSIONS 绑定', 500, 'kv_not_configured');
  }

  const url = new URL(request.url);
  const identifier = url.searchParams.get('session_id') || request.headers.get('X-Session-ID');

  if (!identifier) {
    return createErrorResponse('缺少 session_id 参数', 400, 'missing_session_id');
  }

  const sessionId = generateSessionId(identifier);

  switch (request.method) {
    case 'GET': {
      // 获取会话历史
      const session = await getSession(kv, sessionId);
      if (!session) {
        return new Response(JSON.stringify({
          session_id: identifier,
          messages: [],
          message: '会话不存在或已过期'
        }), {
          headers: corsHeaders({ 'Content-Type': 'application/json' })
        });
      }
      return new Response(JSON.stringify({
        session_id: identifier,
        messages: session.messages || [],
        updated_at: session.updated_at
      }), {
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }

    case 'DELETE': {
      // 清除会话
      try {
        await kv.delete(sessionId);
        return new Response(JSON.stringify({
          session_id: identifier,
          message: '会话已清除'
        }), {
          headers: corsHeaders({ 'Content-Type': 'application/json' })
        });
      } catch (e) {
        return createErrorResponse(`清除会话失败: ${e.message}`, 500, 'delete_failed');
      }
    }

    default:
      return createErrorResponse('不支持的请求方法，请使用 GET 或 DELETE', 405, 'method_not_allowed');
  }
}

// OpenAI 标准图片生成接口 (/v1/images/generations)
// 返回标准 OpenAI 格式: { created, data: [{ url, b64_json, revised_prompt }] }
async function handleImageGenerations(request, requestId) {
  try {
    const body = await request.json();
    const requestedModel = body.model || "flux-2"; // 默认图片模型
    const model = resolveModelName(requestedModel);
    const prompt = body.prompt;

    if (!prompt) {
      return createErrorResponse("缺少必需的 prompt 参数", 400, 'invalid_request');
    }

    // 验证是否为图片模型
    if (!CONFIG.IMAGE_MODELS.includes(model)) {
      return createErrorResponse(`模型 ${requestedModel} 不是图片生成模型`, 400, 'invalid_model');
    }

    // 解析图片参数
    const imageParams = parseImageParams(body);
    const payload = buildImagePayload(prompt, model, imageParams);
    const headers = {
      ...CONFIG.BASE_HEADERS,
      "referer": CONFIG.REFERER_IMAGE_URL,
      "cookie": generateRandomUserOrigin()
    };

    // 生成多张图片
    const imageUrls = [];
    for (let i = 0; i < imageParams.n; i++) {
      const reqHeaders = { ...headers, "cookie": generateRandomUserOrigin() };
      const response = await fetch(CONFIG.UPSTREAM_IMAGE_URL, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`上游图片服务错误 (${response.status}): ${errText}`);
      }

      const result = await response.json();
      if (result.error || !result.url) {
        throw new Error(`图片生成失败: ${result.error || '未返回URL'}`);
      }
      imageUrls.push(result.url);
    }

    // 构建 OpenAI 格式响应
    const openAIResponse = await buildOpenAIImageResponse(imageUrls, imageParams, requestId);

    return new Response(JSON.stringify(openAIResponse), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });

  } catch (e) {
    return createErrorResponse(e.message, 500, 'internal_error');
  }
}

// 统一聊天/图片生成接口 (智能路由 + 支持流式/非流式 + 会话持久化)
async function handleChatCompletions(request, requestId) {
  try {
    const body = await request.json();
    const requestedModel = body.model || "grok-4-fast"; // 用户请求的模型名(显示名)
    const model = resolveModelName(requestedModel); // 转换为实际调用名

    // 更健壮地判断是否为流式请求 (支持布尔值和字符串)
    const streamParam = body.stream;
    // 只有明确设置为 true 或 "true" 时才使用流式
    const isStream = streamParam === true || streamParam === "true";

    // 检查是否为图片模型
    const isImageModel = CONFIG.IMAGE_MODELS.includes(model);

    // 提取 prompt
    // 对于 /v1/images/generations, prompt 在 body.prompt
    // 对于 /v1/chat/completions, prompt 在最后一个用户消息中
    let prompt = body.prompt;
    if (!prompt) {
      const lastUserMessage = body.messages?.filter(m => m.role === 'user').pop();
      prompt = lastUserMessage?.content;
    }

    if (!prompt) {
      return createErrorResponse("无法找到有效的 prompt。", 400, 'invalid_request');
    }

    // --- 会话持久化逻辑 ---
    const kv = request.ctx.kv;
    let sessionId = null;
    let sessionMessages = [];

    // 只对聊天模型启用会话持久化
    if (!isImageModel && CONFIG.SESSION_ENABLED && kv) {
      const identifier = extractSessionIdentifier(request, body);
      if (identifier) {
        sessionId = generateSessionId(identifier);
        const session = await getSession(kv, sessionId);
        if (session && session.messages) {
          sessionMessages = session.messages;
        }
      }
    }

    // 合并历史消息和当前请求消息
    let mergedMessages = body.messages || [];
    if (sessionMessages.length > 0 && mergedMessages.length > 0) {
      // 将历史消息插入到当前消息之前（排除 system 消息）
      const systemMsgs = mergedMessages.filter(m => m.role === 'system');
      const nonSystemMsgs = mergedMessages.filter(m => m.role !== 'system');
      mergedMessages = [...systemMsgs, ...sessionMessages, ...nonSystemMsgs];
    }

    // 非流式响应处理 (传入 requestedModel 作为响应中的模型名)
    if (!isStream) {
      return handleNonStreamChatCompletions(request, body, model, requestedModel, prompt, isImageModel, requestId, sessionId, mergedMessages);
    }

    // 流式响应处理
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      let assistantContent = ''; // 用于收集完整回复以保存到会话

      try {
        if (isImageModel) {
          // --- 图片模型逻辑：获取URL并作为单个流式块发送 ---
          const imageParams = parseImageParams(body);
          const payload = buildImagePayload(prompt, model, imageParams);
          const headers = {
            ...CONFIG.BASE_HEADERS,
            "referer": CONFIG.REFERER_IMAGE_URL,
            "cookie": generateRandomUserOrigin()
          };

          // 生成多张图片（如果 n > 1）
          const imageUrls = [];
          for (let i = 0; i < imageParams.n; i++) {
            // 每次请求添加不同的随机 cookie
            const reqHeaders = { ...headers, "cookie": generateRandomUserOrigin() };
            const response = await fetch(CONFIG.UPSTREAM_IMAGE_URL, {
              method: "POST",
              headers: reqHeaders,
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`上游图片服务错误 (${response.status}): ${errText}`);
            }

            const result = await response.json();
            if (result.error || !result.url) {
              throw new Error(`图片生成失败: ${result.error || '未返回URL'}`);
            }
            imageUrls.push(result.url);
          }

          // 构建 Markdown 格式的图片内容
          let markdownContent = '';
          for (let i = 0; i < imageUrls.length; i++) {
            const imgLabel = imageUrls.length > 1 ? `${prompt} (${i + 1}/${imageUrls.length})` : prompt;
            markdownContent += `![${imgLabel}](${imageUrls[i]})`;
            if (i < imageUrls.length - 1) markdownContent += '\n\n';
          }
          assistantContent = markdownContent;

          // 发送包含完整内容的单个数据块
          const contentChunk = createChatCompletionChunk(requestId, requestedModel, markdownContent);
          await writer.write(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));

        } else {
          // --- 聊天模型逻辑：代理上游流式响应 ---
          const typliSessionId = generateRandomId(16);
          const typliMessages = (mergedMessages || []).map(msg => ({
            parts: [{ type: "text", text: msg.content }],
            id: generateRandomId(16),
            role: msg.role
          }));

          const payload = {
            slug: "free-no-sign-up-chatgpt",
            modelId: model,
            id: typliSessionId,
            messages: typliMessages,
            trigger: "submit-message"
          };

          const headers = { ...CONFIG.BASE_HEADERS, "referer": CONFIG.REFERER_CHAT_URL };
          const response = await fetch(CONFIG.UPSTREAM_CHAT_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`上游聊天服务错误 (${response.status}): ${errText}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const data = JSON.parse(dataStr);
                  if (data.type === 'text-delta' && data.delta) {
                    assistantContent += data.delta; // 收集完整回复
                    const chunk = createChatCompletionChunk(requestId, requestedModel, data.delta);
                    await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                  }
                } catch (e) { /* 忽略解析错误 */ }
              }
            }
          }
        }

        // 统一发送结束块和 [DONE] 标志
        const endChunk = createChatCompletionChunk(requestId, requestedModel, null, "stop");
        await writer.write(encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`));
        await writer.write(encoder.encode('data: [DONE]\n\n'));

        // 保存会话（仅聊天模型）
        if (sessionId && !isImageModel && assistantContent) {
          await appendToSession(kv, sessionId, prompt, assistantContent);
        }

      } catch (e) {
        // 在流中报告错误
        const errorContent = `\n\n[服务代理错误: ${e.message}]`;
        const errorChunk = createChatCompletionChunk(requestId, requestedModel, errorContent, "stop");
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: corsHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    });

  } catch (e) {
    // 对于请求体解析等早期错误，返回非流式错误
    return createErrorResponse(e.message, 500, 'internal_error');
  }
}

// 非流式聊天响应处理
// model: 实际调用上游的模型名, responseModel: 返回给用户的模型名(显示名)
async function handleNonStreamChatCompletions(request, body, model, responseModel, prompt, isImageModel, requestId, sessionId, mergedMessages) {
  try {
    let content = '';
    const kv = request.ctx.kv;

    if (isImageModel) {
      // 图片模型：获取URL（支持高级参数）
      const imageParams = parseImageParams(body);
      const payload = buildImagePayload(prompt, model, imageParams);
      const headers = {
        ...CONFIG.BASE_HEADERS,
        "referer": CONFIG.REFERER_IMAGE_URL,
        "cookie": generateRandomUserOrigin()
      };

      // 生成多张图片（如果 n > 1）
      const imageUrls = [];
      for (let i = 0; i < imageParams.n; i++) {
        const reqHeaders = { ...headers, "cookie": generateRandomUserOrigin() };
        const response = await fetch(CONFIG.UPSTREAM_IMAGE_URL, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`上游图片服务错误 (${response.status}): ${errText}`);
        }

        const result = await response.json();
        if (result.error || !result.url) {
          throw new Error(`图片生成失败: ${result.error || '未返回URL'}`);
        }
        imageUrls.push(result.url);
      }

      // 构建 Markdown 格式的图片内容
      for (let i = 0; i < imageUrls.length; i++) {
        const imgLabel = imageUrls.length > 1 ? `${prompt} (${i + 1}/${imageUrls.length})` : prompt;
        content += `![${imgLabel}](${imageUrls[i]})`;
        if (i < imageUrls.length - 1) content += '\n\n';
      }

    } else {
      // 聊天模型：收集完整响应
      const typliSessionId = generateRandomId(16);
      const typliMessages = (mergedMessages || body.messages || []).map(msg => ({
        parts: [{ type: "text", text: msg.content }],
        id: generateRandomId(16),
        role: msg.role
      }));

      const payload = {
        slug: "free-no-sign-up-chatgpt",
        modelId: model,
        id: typliSessionId,
        messages: typliMessages,
        trigger: "submit-message"
      };

      const headers = { ...CONFIG.BASE_HEADERS, "referer": CONFIG.REFERER_CHAT_URL };
      const response = await fetch(CONFIG.UPSTREAM_CHAT_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`上游聊天服务错误 (${response.status}): ${errText}`);
      }

      // 收集所有流式数据
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'text-delta' && data.delta) {
                content += data.delta;
              }
            } catch (e) { /* 忽略解析错误 */ }
          }
        }
      }

      // 保存会话（仅聊天模型）
      if (sessionId && content) {
        await appendToSession(kv, sessionId, prompt, content);
      }
    }

    // 构建 OpenAI 格式的非流式响应
    const completionResponse = {
      id: requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: responseModel,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: content
        },
        finish_reason: "stop"
      }],
      usage: {
        prompt_tokens: prompt.length,
        completion_tokens: content.length,
        total_tokens: prompt.length + content.length
      }
    };

    return new Response(JSON.stringify(completionResponse), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });

  } catch (e) {
    return createErrorResponse(e.message, 500, 'internal_error');
  }
}

// --- [第三部分-B: Gemini API 代理逻辑] ---

async function handleGeminiApi(request) {
  if (!verifyAuth(request)) {
    return createGeminiErrorResponse('API key not valid', 401, 'UNAUTHENTICATED');
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 解析路径: /v1beta/models/{model}:{action}
  const match = pathname.match(/^\/v1beta\/models\/([^:]+):(.+)$/);
  if (!match) {
    return createGeminiErrorResponse('Invalid endpoint format', 400, 'INVALID_ARGUMENT');
  }

  const [, model, action] = match;
  const requestId = `gemini-${crypto.randomUUID()}`;

  // 验证模型是否支持
  const allGeminiModels = [...CONFIG.GEMINI_CHAT_MODELS, ...CONFIG.GEMINI_IMAGE_MODELS];
  if (!allGeminiModels.includes(model)) {
    return createGeminiErrorResponse(`Model ${model} not found`, 404, 'NOT_FOUND');
  }

  const isImageModel = CONFIG.GEMINI_IMAGE_MODELS.includes(model);
  const isChatModel = CONFIG.GEMINI_CHAT_MODELS.includes(model);

  switch (action) {
    case 'generateContent':
    case 'streamGenerateContent':
      // 如果是图片模型，智能路由到图片生成（从 contents 提取 prompt）
      if (isImageModel) {
        return handleGeminiImageFromChat(request, model, requestId);
      }
      return handleGeminiGenerateContent(request, model, requestId, action === 'streamGenerateContent');
    case 'predict':
      if (isChatModel) {
        return createGeminiErrorResponse(`Model ${model} is a chat model, use :generateContent instead`, 400, 'INVALID_ARGUMENT');
      }
      return handleGeminiPredict(request, model, requestId);
    default:
      return createGeminiErrorResponse(`Unknown action: ${action}`, 400, 'INVALID_ARGUMENT');
  }
}

// Gemini 图片模型通过 generateContent 调用时的智能适配
async function handleGeminiImageFromChat(request, model, requestId) {
  try {
    const body = await request.json();
    const contents = body.contents || [];

    // 从 contents 中提取文本作为图片生成 prompt
    let prompt = '';
    for (const content of contents) {
      if (content.parts) {
        for (const part of content.parts) {
          if (part.text) {
            prompt += part.text + ' ';
          }
        }
      }
    }
    prompt = prompt.trim();

    if (!prompt) {
      return createGeminiErrorResponse('No text prompt found in contents', 400, 'INVALID_ARGUMENT');
    }

    // 解析图片参数（兼容 Gemini 格式）
    const imageParams = parseImageParams(body);
    const payload = buildImagePayload(prompt, model, imageParams);
    const headers = {
      ...CONFIG.BASE_HEADERS,
      "referer": CONFIG.REFERER_IMAGE_URL,
      "cookie": generateRandomUserOrigin()
    };

    // 生成图片（支持多张）
    const images = [];
    for (let i = 0; i < imageParams.n; i++) {
      const reqHeaders = { ...headers, "cookie": generateRandomUserOrigin() };
      const response = await fetch(CONFIG.UPSTREAM_IMAGE_URL, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Upstream image service error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      if (result.error || !result.url) {
        throw new Error(`Image generation failed: ${result.error || 'No URL returned'}`);
      }

      // 下载图片并转换为 Base64
      const imageResponse = await fetch(result.url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = arrayBufferToBase64(imageBuffer);
      const contentType = imageResponse.headers.get('content-type') || 'image/png';

      images.push({ base64: base64Image, mimeType: contentType });
    }

    // 返回 Gemini generateContent 格式的图片响应（支持多张图片）
    const parts = images.map(img => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64
      }
    }));

    const geminiResponse = {
      candidates: [{
        content: {
          parts: parts,
          role: "model"
        },
        finishReason: "STOP",
        index: 0,
        safetyRatings: []
      }],
      usageMetadata: {
        promptTokenCount: prompt.length,
        candidatesTokenCount: images.length,
        totalTokenCount: prompt.length + images.length
      },
      modelVersion: model
    };

    return new Response(JSON.stringify(geminiResponse), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });

  } catch (e) {
    return createGeminiErrorResponse(e.message, 500, 'INTERNAL');
  }
}

// Gemini 聊天接口 (generateContent / streamGenerateContent)
async function handleGeminiGenerateContent(request, model, requestId, isStream) {
  try {
    const body = await request.json();
    const contents = body.contents || [];

    // 转换 Gemini 格式到内部格式
    const messages = contents.map(c => ({
      role: c.role === 'model' ? 'assistant' : c.role,
      content: c.parts?.map(p => p.text).join('') || ''
    }));

    if (messages.length === 0) {
      return createGeminiErrorResponse('contents cannot be empty', 400, 'INVALID_ARGUMENT');
    }

    // 构建 Typli 请求
    const sessionId = generateRandomId(16);
    const typliMessages = messages.map(msg => ({
      parts: [{ type: "text", text: msg.content }],
      id: generateRandomId(16),
      role: msg.role === 'assistant' ? 'assistant' : msg.role
    }));

    const payload = {
      slug: "free-no-sign-up-chatgpt",
      modelId: model,
      id: sessionId,
      messages: typliMessages,
      trigger: "submit-message"
    };

    const headers = { ...CONFIG.BASE_HEADERS, "referer": CONFIG.REFERER_CHAT_URL };
    const response = await fetch(CONFIG.UPSTREAM_CHAT_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upstream error (${response.status}): ${errText}`);
    }

    if (isStream) {
      // 流式响应
      return handleGeminiStreamResponse(response, model, requestId);
    } else {
      // 非流式响应：收集所有内容后一次性返回
      return handleGeminiNonStreamResponse(response, model, requestId);
    }

  } catch (e) {
    return createGeminiErrorResponse(e.message, 500, 'INTERNAL');
  }
}

// Gemini 流式响应处理
async function handleGeminiStreamResponse(upstreamResponse, model, requestId) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'text-delta' && data.delta) {
                const geminiChunk = createGeminiStreamChunk(model, data.delta);
                await writer.write(encoder.encode(`data: ${JSON.stringify(geminiChunk)}\n\n`));
              }
            } catch (e) { /* 忽略解析错误 */ }
          }
        }
      }

      // 发送结束标记
      const endChunk = createGeminiStreamChunk(model, null, "STOP");
      await writer.write(encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`));

    } catch (e) {
      const errorChunk = { error: { code: 500, message: e.message, status: "INTERNAL" } };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: corsHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  });
}

// Gemini 非流式响应处理
async function handleGeminiNonStreamResponse(upstreamResponse, model, requestId) {
  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'text-delta' && data.delta) {
            fullContent += data.delta;
          }
        } catch (e) { /* 忽略解析错误 */ }
      }
    }
  }

  // 构建 Gemini 格式响应
  const geminiResponse = {
    candidates: [{
      content: {
        parts: [{ text: fullContent }],
        role: "model"
      },
      finishReason: "STOP",
      index: 0,
      safetyRatings: []
    }],
    usageMetadata: {
      promptTokenCount: 0,
      candidatesTokenCount: fullContent.length,
      totalTokenCount: fullContent.length
    },
    modelVersion: model
  };

  return new Response(JSON.stringify(geminiResponse), {
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

// Gemini 图片生成接口 (predict)
async function handleGeminiPredict(request, model, requestId) {
  try {
    const body = await request.json();

    // 支持两种请求格式
    // 格式1: { instances: [{ prompt: "..." }] }
    // 格式2: { prompt: "..." }
    let prompt = body.prompt;
    if (!prompt && body.instances && body.instances.length > 0) {
      prompt = body.instances[0].prompt;
    }

    if (!prompt) {
      return createGeminiErrorResponse('prompt is required', 400, 'INVALID_ARGUMENT');
    }

    // 验证是否为图片模型
    if (!CONFIG.GEMINI_IMAGE_MODELS.includes(model)) {
      return createGeminiErrorResponse(`Model ${model} does not support image generation`, 400, 'INVALID_ARGUMENT');
    }

    // 解析图片参数（兼容 Gemini 格式）
    const imageParams = parseImageParams(body);
    const payload = buildImagePayload(prompt, model, imageParams);
    const headers = {
      ...CONFIG.BASE_HEADERS,
      "referer": CONFIG.REFERER_IMAGE_URL,
      "cookie": generateRandomUserOrigin()
    };

    // 生成多张图片
    const predictions = [];
    for (let i = 0; i < imageParams.n; i++) {
      const reqHeaders = { ...headers, "cookie": generateRandomUserOrigin() };
      const response = await fetch(CONFIG.UPSTREAM_IMAGE_URL, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Upstream image service error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      if (result.error || !result.url) {
        throw new Error(`Image generation failed: ${result.error || 'No URL returned'}`);
      }

      // 下载图片并转换为 Base64
      const imageResponse = await fetch(result.url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = arrayBufferToBase64(imageBuffer);
      const contentType = imageResponse.headers.get('content-type') || 'image/png';

      predictions.push({
        bytesBase64Encoded: base64Image,
        mimeType: contentType
      });
    }

    const geminiResponse = {
      predictions: predictions,
      modelVersion: model
    };

    return new Response(JSON.stringify(geminiResponse), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });

  } catch (e) {
    return createGeminiErrorResponse(e.message, 500, 'INTERNAL');
  }
}

// --- [第四部分: 辅助函数] ---

function generateRandomId(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// 生成随机的 user_origin cookie（用于绕过图片生成额度限制）
function generateRandomUserOrigin() {
  const countries = ['US', 'UK', 'DE', 'FR', 'JP', 'KR', 'SG', 'AU', 'CA', 'NL', 'SE', 'NO', 'FI', 'DK', 'CH', 'AT', 'BE', 'IE', 'NZ', 'ES', 'IT', 'PT', 'PL', 'CZ', 'HU'];
  const cities = ['New York', 'London', 'Berlin', 'Paris', 'Tokyo', 'Seoul', 'Singapore', 'Sydney', 'Toronto', 'Amsterdam', 'Stockholm', 'Oslo', 'Helsinki', 'Copenhagen', 'Zurich', 'Vienna', 'Brussels', 'Dublin', 'Auckland', 'Madrid', 'Rome', 'Lisbon', 'Warsaw', 'Prague', 'Budapest'];
  const referers = ['https://www.google.com/', 'https://www.bing.com/', 'https://duckduckgo.com/', 'https://twitter.com/', 'https://reddit.com/', 'https://www.facebook.com/', 'https://www.linkedin.com/', 'https://www.pinterest.com/', 'https://www.instagram.com/', '', null];
  const landingPages = ['/ai-image-generator', '/ai-text-generator', '/free-no-sign-up-chatgpt', '/', '/blog', '/pricing', '/about'];
  const regions = ['Unknown', 'California', 'Texas', 'Florida', 'New York', 'Illinois', 'Pennsylvania', 'Ohio', 'Georgia', 'North Carolina', 'Michigan'];

  const idx = Math.floor(Math.random() * countries.length);
  const userOrigin = {
    country: countries[idx],
    city: cities[idx % cities.length],
    region: regions[Math.floor(Math.random() * regions.length)],
    referer: referers[Math.floor(Math.random() * referers.length)],
    landingPage: landingPages[Math.floor(Math.random() * landingPages.length)],
    timestamp: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(), // 随机过去24小时内的时间
    sessionId: generateRandomId(32), // 添加随机会话ID
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  // 生成额外的随机 cookie
  const visitorId = generateRandomId(24);
  const sessionToken = generateRandomId(16);

  return `user_origin=${encodeURIComponent(JSON.stringify(userOrigin))}; visitor_id=${visitorId}; session_token=${sessionToken}; _ga=GA1.1.${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000)}`;
}

// --- [图片参数解析辅助函数] ---

// 解析图片生成参数（兼容 OpenAI 和 Gemini 格式）
function parseImageParams(body) {
  const params = {
    n: CONFIG.IMAGE_DEFAULTS.n,
    size: CONFIG.IMAGE_DEFAULTS.size,
    width: 1024,
    height: 1024,
    aspectRatio: "1:1",
    quality: CONFIG.IMAGE_DEFAULTS.quality,
    style: CONFIG.IMAGE_DEFAULTS.style,
    response_format: CONFIG.IMAGE_DEFAULTS.response_format,
    negative_prompt: null,
    seed: null
  };

  // OpenAI 格式参数
  if (body.n !== undefined) {
    params.n = Math.min(Math.max(1, parseInt(body.n) || 1), 4); // 限制 1-4
  }
  if (body.size) {
    params.size = body.size;
  }
  if (body.quality) {
    params.quality = body.quality;
  }
  if (body.style) {
    params.style = body.style;
  }
  if (body.response_format) {
    params.response_format = body.response_format;
  }

  // Gemini 格式参数 (从 parameters 对象中读取)
  const geminiParams = body.parameters || {};
  if (geminiParams.sampleCount !== undefined) {
    params.n = Math.min(Math.max(1, parseInt(geminiParams.sampleCount) || 1), 4);
  }
  if (geminiParams.aspectRatio) {
    params.size = geminiParams.aspectRatio; // 使用宽高比作为 size key
  }
  if (geminiParams.negativePrompt) {
    params.negative_prompt = geminiParams.negativePrompt;
  }
  if (geminiParams.seed !== undefined) {
    params.seed = geminiParams.seed;
  }

  // 从 generationConfig 读取 (Gemini 另一种格式)
  const genConfig = body.generationConfig || {};
  if (genConfig.numberOfImages !== undefined) {
    params.n = Math.min(Math.max(1, parseInt(genConfig.numberOfImages) || 1), 4);
  }
  if (genConfig.aspectRatio) {
    params.size = genConfig.aspectRatio;
  }

  // 解析尺寸
  const sizeInfo = CONFIG.SIZE_MAP[params.size] || CONFIG.SIZE_MAP["1024x1024"];
  params.width = sizeInfo.width;
  params.height = sizeInfo.height;
  params.aspectRatio = sizeInfo.aspectRatio;

  return params;
}

// 构建上游图片生成请求载荷
function buildImagePayload(prompt, model, imageParams) {
  const payload = {
    prompt: prompt,
    model: model
  };

  // 检查是否为仅支持基本参数的模型
  const isBasicOnly = CONFIG.BASIC_ONLY_IMAGE_MODELS.includes(model);
  if (isBasicOnly) {
    // 这些模型只支持 prompt 和 model，不添加任何额外参数
    return payload;
  }

  // 添加尺寸参数
  if (imageParams.width && imageParams.height) {
    payload.width = imageParams.width;
    payload.height = imageParams.height;
  }

  // 添加宽高比（某些模型使用）
  if (imageParams.aspectRatio) {
    payload.aspect_ratio = imageParams.aspectRatio;
  }

  // 添加负面提示词
  if (imageParams.negative_prompt) {
    payload.negative_prompt = imageParams.negative_prompt;
  }

  // 添加随机种子
  if (imageParams.seed !== null) {
    payload.seed = imageParams.seed;
  }

  // 添加质量参数（转换为上游格式）
  if (imageParams.quality === "hd") {
    payload.num_inference_steps = 50; // 高质量使用更多推理步数
  }

  return payload;
}

// 构建 OpenAI 格式的图片响应
async function buildOpenAIImageResponse(imageUrls, imageParams, requestId) {
  const data = [];

  for (const url of imageUrls) {
    if (imageParams.response_format === "b64_json") {
      // 下载图片并转换为 Base64
      try {
        const imageResponse = await fetch(url);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64Image = arrayBufferToBase64(imageBuffer);
          data.push({
            b64_json: base64Image,
            revised_prompt: null
          });
        }
      } catch (e) {
        // 如果下载失败，回退到 URL
        data.push({ url: url, revised_prompt: null });
      }
    } else {
      data.push({ url: url, revised_prompt: null });
    }
  }

  return {
    created: Math.floor(Date.now() / 1000),
    data: data
  };
}

// --- [会话持久化辅助函数] ---

// 生成会话 ID（基于用户标识）
function generateSessionId(identifier) {
  // 如果提供了标识符，使用它；否则生成随机 ID
  if (identifier) {
    return `session_${identifier}`;
  }
  return `session_${generateRandomId(16)}`;
}

// 从请求中提取会话标识符
function extractSessionIdentifier(request, body) {
  // 优先使用请求体中的 session_id
  if (body.session_id) {
    return body.session_id;
  }
  // 其次使用 X-Session-ID 头
  const sessionHeader = request.headers.get('X-Session-ID');
  if (sessionHeader) {
    return sessionHeader;
  }
  // 最后使用 user 字段（OpenAI 兼容）
  if (body.user) {
    return body.user;
  }
  return null;
}

// 获取会话历史
async function getSession(kv, sessionId) {
  if (!kv || !CONFIG.SESSION_ENABLED) {
    return null;
  }
  try {
    const data = await kv.get(sessionId, { type: 'json' });
    return data;
  } catch (e) {
    console.error('获取会话失败:', e.message);
    return null;
  }
}

// 保存会话历史
async function saveSession(kv, sessionId, messages) {
  if (!kv || !CONFIG.SESSION_ENABLED) {
    return false;
  }
  try {
    // 限制消息数量
    const trimmedMessages = messages.slice(-CONFIG.SESSION_MAX_MESSAGES);
    const sessionData = {
      messages: trimmedMessages,
      updated_at: new Date().toISOString()
    };
    await kv.put(sessionId, JSON.stringify(sessionData), {
      expirationTtl: CONFIG.SESSION_TTL
    });
    return true;
  } catch (e) {
    console.error('保存会话失败:', e.message);
    return false;
  }
}

// 追加消息到会话
async function appendToSession(kv, sessionId, userMessage, assistantMessage) {
  if (!kv || !CONFIG.SESSION_ENABLED) {
    return false;
  }
  try {
    const session = await getSession(kv, sessionId) || { messages: [] };
    const messages = session.messages || [];

    // 添加用户消息
    if (userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }
    // 添加助手回复
    if (assistantMessage) {
      messages.push({ role: 'assistant', content: assistantMessage });
    }

    return await saveSession(kv, sessionId, messages);
  } catch (e) {
    console.error('追加会话失败:', e.message);
    return false;
  }
}

// ArrayBuffer 转 Base64 (Cloudflare Worker 兼容)
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Gemini 流式响应块
function createGeminiStreamChunk(model, content, finishReason = null) {
  const chunk = {
    candidates: [{
      content: {
        parts: content ? [{ text: content }] : [],
        role: "model"
      },
      index: 0
    }],
    modelVersion: model
  };

  if (finishReason) {
    chunk.candidates[0].finishReason = finishReason;
  }

  return chunk;
}

// Gemini 错误响应
function createGeminiErrorResponse(message, status, code) {
  return new Response(JSON.stringify({
    error: {
      code: status,
      message: message,
      status: code
    }
  }), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

function createChatCompletionChunk(id, model, content, finishReason = null) {
  const chunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: finishReason
    }]
  };
  if (content) {
    chunk.choices[0].delta.content = content;
  }
  return chunk;
}

function createErrorResponse(message, status, code) {
  return new Response(JSON.stringify({
    error: { message, type: 'api_error', code }
  }), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

function handleCorsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(headers = {}) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// --- [第五部分: 开发者驾驶舱 UI (WebUI)] ---
// (Web UI 代码未作任何修改，保持原样)
function handleUI(request) {
  const origin = new URL(request.url).origin;
  const apiKey = request.ctx.apiKey;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.PROJECT_NAME} - 开发者驾驶舱</title>
    <style>
      :root { --bg: #121212; --panel: #1E1E1E; --border: #333; --text: #E0E0E0; --primary: #FFBF00; --accent: #007AFF; --success: #66BB6A; --error: #CF6679; }
      body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); margin: 0; height: 100vh; display: flex; overflow: hidden; }
      .sidebar { width: 380px; background: var(--panel); border-right: 1px solid var(--border); padding: 20px; display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
      .main { flex: 1; display: flex; flex-direction: column; padding: 20px; position: relative; }
      .box { background: #252525; padding: 15px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px; }
      .label { font-size: 12px; color: #888; margin-bottom: 8px; display: block; font-weight: 600; }
      .code-block { font-family: monospace; font-size: 12px; color: var(--primary); word-break: break-all; background: #111; padding: 10px; border-radius: 4px; cursor: pointer; transition: background 0.2s; }
      .code-block:hover { background: #000; }
      input, select, textarea { width: 100%; background: #333; border: 1px solid #444; color: #fff; padding: 10px; border-radius: 4px; margin-bottom: 15px; box-sizing: border-box; font-family: inherit; }
      input:focus, textarea:focus { border-color: var(--primary); outline: none; }
      button { width: 100%; padding: 12px; background: var(--primary); border: none; border-radius: 4px; font-weight: bold; cursor: pointer; color: #000; transition: opacity 0.2s; }
      button:hover { opacity: 0.9; }
      button:disabled { background: #555; cursor: not-allowed; }
      .tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 15px; }
      .tab-button { padding: 10px 15px; cursor: pointer; background: none; border: none; color: #888; font-weight: 600; border-bottom: 2px solid transparent; }
      .tab-button.active { color: var(--primary); border-bottom-color: var(--primary); }
      .tab-content { display: none; }
      .tab-content.active { display: block; }
      .chat-window { flex: 1; background: #000; border: 1px solid var(--border); border-radius: 8px; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
      .msg { max-width: 85%; padding: 15px; border-radius: 8px; line-height: 1.6; word-wrap: break-word; }
      .msg.user { align-self: flex-end; background: #333; color: #fff; border-bottom-right-radius: 2px; }
      .msg.ai { align-self: flex-start; background: #1a1a1a; border: 1px solid #333; border-bottom-left-radius: 2px; }
      .msg.error { color: var(--error); border-color: var(--error); }
      .image-container { text-align: center; margin-top: 20px; }
      .image-container img { max-width: 100%; max-height: 70vh; border-radius: 8px; border: 1px solid var(--border); }
      .log-panel { height: 150px; background: #111; border-top: 1px solid var(--border); padding: 10px; font-family: monospace; font-size: 11px; color: #aaa; overflow-y: auto; }
      .log-entry { margin-bottom: 4px; border-bottom: 1px solid #222; padding-bottom: 2px; }
      .log-time { color: #666; margin-right: 5px; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
            <h2 style="margin:0; display:flex; align-items:center; gap:10px;">
                🚀 ${CONFIG.PROJECT_NAME}
                <span style="font-size:12px;color:#888; font-weight:normal; margin-top:4px;">v${CONFIG.PROJECT_VERSION}</span>
            </h2>
        </div>
        <div class="box">
            <span class="label">API 密钥 (点击复制)</span>
            <div class="code-block" onclick="copy('${apiKey}')">${apiKey}</div>
        </div>
        <div class="box">
            <span class="label">统一 API 入口 (聊天/文生图)</span>
            <div class="code-block" onclick="copy('${origin}/v1/chat/completions')">${origin}/v1/chat/completions</div>
        </div>
        <div class="box">
            <div class="tabs">
                <button class="tab-button active" onclick="openTab('chat-tab')">💬 聊天</button>
                <button class="tab-button" onclick="openTab('image-tab')">🎨 文生图</button>
            </div>
            <div id="chat-tab" class="tab-content active">
                <span class="label">聊天模型</span>
                <select id="chat-model">
                    ${CONFIG.CHAT_MODELS.map(m => `<option value="${m}" ${m === CONFIG.DEFAULT_CHAT_MODEL ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <span class="label">提示词 (Prompt)</span>
                <textarea id="chat-prompt" rows="5" placeholder="输入你的问题...">你好，请介绍一下你自己。</textarea>
                <button id="btn-chat" onclick="sendChatRequest()">🚀 发送聊天请求</button>
            </div>
            <div id="image-tab" class="tab-content">
                <span class="label">绘图模型</span>
                <select id="image-model">
                    ${CONFIG.IMAGE_MODELS.map(m => `<option value="${m}" ${m === CONFIG.DEFAULT_IMAGE_MODEL ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <span class="label">提示词 (Prompt)</span>
                <textarea id="image-prompt" rows="5" placeholder="描述你想要生成的图片..."></textarea>
                <button id="btn-image" onclick="sendImageRequest()">🎨 生成图片</button>
            </div>
        </div>
    </div>
    <main class="main">
        <div class="chat-window" id="output-window">
            <div id="initial-message" style="color:#666; text-align:center; margin-top:100px;">
                <div style="font-size:40px; margin-bottom:20px;">🤖</div>
                <h3>Typli 代理服务就绪</h3>
                <p>每次请求自动生成新身份，绕过 1000 词限制。<br>体验极速 Grok-4 推理与文生图能力。</p>
            </div>
        </div>
        <div class="log-panel" id="logs">
            <div class="log-entry"><span class="log-time">[System]</span> 驾驶舱初始化完成。</div>
        </div>
    </main>
    <script>
        const API_KEY = "${apiKey}";
        const CHAT_ENDPOINT = "${origin}/v1/chat/completions";
        // Web UI 的图片请求也统一走 CHAT_ENDPOINT
        const IMAGE_ENDPOINT = "${origin}/v1/chat/completions"; 

        function openTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function copy(text) {
            navigator.clipboard.writeText(text);
            log('System', '已复制到剪贴板');
        }

        function log(type, msg) {
            const el = document.getElementById('logs');
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.innerHTML = \`<span class="log-time">[\${new Date().toLocaleTimeString()}]</span> <span style="color:var(--primary)">[\${type}]</span> \${msg}\`;
            el.appendChild(div);
            el.scrollTop = el.scrollHeight;
        }

        function clearOutput() {
            const initialMsg = document.getElementById('initial-message');
            if (initialMsg) initialMsg.style.display = 'none';
        }

        function appendMsg(role, text) {
            const div = document.createElement('div');
            div.className = \`msg \${role}\`;
            div.innerText = text;
            document.getElementById('output-window').appendChild(div);
            div.scrollIntoView({ behavior: "smooth" });
            return div;
        }
        
        function renderContent(element, text) {
            // 简单的 Markdown 图片渲染
            const markdownImageRegex = /!\\\[(.*?)\\]\\((.*?)\\)/g;
            let lastIndex = 0;
            let htmlContent = '';

            text.replace(markdownImageRegex, (match, alt, src, offset) => {
                htmlContent += text.substring(lastIndex, offset); // 添加图片前的文本
                htmlContent += \`<div class="image-container"><img src="\${src}" alt="\${alt}" style="max-width:100%; border-radius: 8px;" /></div>\`;
                lastIndex = offset + match.length;
                return match;
            });
            htmlContent += text.substring(lastIndex); // 添加最后一张图片后的文本

            if (lastIndex > 0) { // 如果有图片
                element.innerHTML = htmlContent;
            } else {
                element.innerText = text;
            }
        }

        async function handleStreamRequest(endpoint, payload, userPrompt) {
            clearOutput();
            appendMsg('user', userPrompt);
            const aiMsg = appendMsg('ai', '▋');
            log('Request', \`发送请求: \${userPrompt.substring(0, 30)}...\`);

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = "";
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            if (dataStr === '[DONE]') continue;
                            try {
                                const data = JSON.parse(dataStr);
                                const content = data.choices[0]?.delta?.content || "";
                                fullText += content;
                                renderContent(aiMsg, fullText + "▋");
                                aiMsg.scrollIntoView({ behavior: "smooth", block: "end" });
                            } catch (e) {}
                        }
                    }
                }
                renderContent(aiMsg, fullText);
                log('Response', '响应接收完成');

            } catch (e) {
                aiMsg.classList.add('error');
                aiMsg.innerText += \`\n[错误: \${e.message}]\`;
                log('Error', e.message);
            }
        }

        async function sendChatRequest() {
            const prompt = document.getElementById('chat-prompt').value.trim();
            if (!prompt) return;
            const btn = document.getElementById('btn-chat');
            btn.disabled = true;
            
            const payload = {
                model: document.getElementById('chat-model').value,
                messages: [{ role: 'user', content: prompt }],
                stream: true
            };
            
            await handleStreamRequest(CHAT_ENDPOINT, payload, prompt);
            btn.disabled = false;
        }

        async function sendImageRequest() {
            const prompt = document.getElementById('image-prompt').value.trim();
            if (!prompt) return;
            const btn = document.getElementById('btn-image');
            btn.disabled = true;

            const payload = {
                model: document.getElementById('image-model').value,
                messages: [{ role: 'user', content: prompt }], // 统一使用 messages 格式
                stream: true
            };

            await handleStreamRequest(IMAGE_ENDPOINT, payload, prompt);
            btn.disabled = false;
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
