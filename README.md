# JudgmentDay

运行在 Ubuntu 上的**网络安全助手** Web 应用：基于阿里百炼千问（qwen3-max）多模态模型，提供登录、对话、设置与调试控制台，支持流式输出、打断对话、文件上传，并预留 UTCP 工具调用与自动化任务扩展接口。AI 具备完全 Shell 权限，可通过 `.env` 中的 `PROJECT_SAVE` 限制对项目本体的修改。

## 技术栈

- **后端**: Python + FastAPI + Uvicorn
- **前端**: 原生 HTML/CSS/JS（Jinja2 模板），无 Vite 等构建工具
- **运行环境**: Conda，环境名 `JudgmentDay`
- **HTTPS**: 预制/自签名证书，默认 443 端口

## 环境准备

1. 创建并激活 Conda 环境：

   ```bash
   conda create -n JudgmentDay python=3.11 -y
   conda activate JudgmentDay
   ```

2. 安装依赖：

   ```bash
   pip install -r requirements.txt
   ```

3. 配置环境变量（项目根目录下已有 `.env`，开箱即用，可按需修改）：

   | 变量 | 说明 | 默认值 |
   |------|------|--------|
   | `WEB_PORT` | Web 服务端口 | `443` |
   | `DEBUG_MODE` | 调试模式，控制台输出更详细日志 | `True` |
   | `PROJECT_SAVE` | 为 `True` 时禁止 AI 通过 Shell 修改项目本体（`tmp/` 不受限） | `True` |
   | `DASH_SCOPE_API_KEY` | 阿里百炼 API Key（也可在设置页按用户配置） | 空 |
   | `SSL_CERT_FILE` | HTTPS 证书文件路径 | `certs/server.crt` |
   | `SSL_KEY_FILE` | HTTPS 私钥文件路径 | `certs/server.key` |
   | `DEFAULT_ADMIN_USERNAME` | 首次启动创建的默认管理员用户名 | `admin` |
   | `DEFAULT_ADMIN_PASSWORD` | 默认管理员密码 | `admin123` |

## 启动方式

在项目根目录下执行：

```bash
conda activate JudgmentDay
python main.py
```

- 首次运行会自动创建 `tmp/`、`data/`、`certs/` 等目录；若未提供证书，会在 `certs/` 下生成自签名证书。
- 使用 443 端口时，Linux 上可能需要 root 或为 Python 赋予 `cap_net_bind_service`，也可将 `WEB_PORT` 改为 8443 等高位端口，或通过 Nginx 等反向代理转发。

## 访问与登录

- 浏览器访问：`https://<服务器IP或域名>:443`（自签名证书会提示不安全，可手动继续访问）。
- 使用 `.env` 中的 `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` 登录。
- 登录后进入对话页，可在顶部导航切换到「设置」「控制台」。

## 功能概览

- **登录页**: 背景图 `images/login.jpg`，左侧 `images/logo.jpg` + 文案 JudgmentDay，右侧登录表单；保留注册与邮箱验证码接口占位。
- **对话页**: 浅色现代风格、流式输出、支持停止生成并保留已有内容；支持上传文件/图片，存储于 `tmp/`。
- **设置页**: 每用户可配置自己的 DashScope API Key，以及是否启用 **UTCP 服务（Shell 工具调用）** 与 **联网搜索**，二者默认开启；持久化在 `data/` 下 JSON 中。联网搜索受阿里云限流与计费约束，详见百炼文档。
- **控制台**: `DEBUG_MODE=True` 时，后端在终端输出尽可能多的调试信息。
- **AI 模型**: 仅使用阿里百炼 qwen3-max 多模态接口（DashScope），采用 UTCP 协议做工具调用，不支持 MCP；预留自动化任务与 Shell 工具扩展。

## 目录结构（简要）

```
JudgmentDay/
├── main.py              # 入口，读取 .env、准备目录与证书、启动 HTTPS 服务
├── .env                 # 环境配置（端口、调试、API Key、证书路径等）
├── app/
│   ├── config.py        # 配置加载
│   ├── security/auth.py # 登录、Session、默认管理员
│   ├── storage/         # JSON 持久化（用户、对话、设置）
│   ├── routes/          # 登录、对话、设置、控制台路由
│   ├── services/        # 对话服务、DashScope 客户端、UTCP Shell 等
│   └── utils/           # 证书生成、日志
├── templates/           # 登录、对话等页面模板
├── static/              # CSS、JS
├── images/              # login.jpg、logo.jpg
├── tmp/                 # 上传文件与临时内容根目录
├── data/                # 用户、对话、设置等 JSON 数据
└── certs/               # 自签名或外部证书
```

## 安全与扩展说明

- **PROJECT_SAVE**：默认开启，AI 使用 Shell 时不得修改项目目录内文件（`tmp/` 除外），避免误删改代码与配置。
- **自动化任务**：设计上避免一次下发过多指令造成卡死；后续可在现有接口上扩展任务队列与分步执行。
- 项目通过根目录 `main.py` 启动，依赖仅通过 `requirements.txt` 与 Conda 管理，无 `.env.example`，直接使用 `.env` 即可开箱运行。
