# typli-2api-cfwork
自动 Session 刷新（每次请求生成全新 16 位 Session ID，绕过 Typli 1000 词额度限制）| 指纹伪装（硬编码 Chrome 142 User-Agent/Headers，实现高级匿名与反检测）| 协议转换（将上游 Typli 的自定义 SSE 和图片 API 完美转换为标准 OpenAI v1/chat/completions 流式接口）| 智能路由（统一接口智能区分聊天/文生图模型，无需单独配置）| 完全无状态（无需自备或持久化 Cookie / Token / 密钥）
