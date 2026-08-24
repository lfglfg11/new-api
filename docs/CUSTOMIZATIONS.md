# Hub 二开保留清单与上游同步手册

> 本文档只维护在 `hub` 二开分支，用于记录必须长期保留的定制能力、冲突处理原则和同步验收项。同步上游时，不能只以“解决 Git 冲突、能够编译”为完成标准，还必须逐项确认本文所列业务不变量没有被覆盖或回退。

## 1. 文档用途

本文档根据以下信息整理：

- `hub` 相对上游合并基线的 Git 提交、差异和 reflog；
- 根目录已有的 `log.md` 开发记录；
- 历史 Codex 聊天记录中关于上游同步、支付、Token 兼容、异步任务轮询、管理员权限和构建冲突的处理结论；
- 当前 `hub` 分支中的实际代码路径。

维护规则：

1. `main` 只用于跟踪上游，不在 `main` 上追加二开代码或本清单。
2. `hub` 是正式二开分支，本文列出的“核心业务不变量”必须保留。
3. `hub-merge-upstream` 是同步缓冲分支，先在该分支解决冲突、构建和业务回归，再合回 `hub`。
4. 新增、删除或改变任何二开代码、配置、前端、工作流、兼容或行为时，必须在同一批变更中同时更新根目录 `log.md`、本文档和对应验证项。
5. Git 自动合并成功不代表业务正确；上游重构、改名或移动文件后，应按“行为”迁移二开逻辑，而不是机械保留旧文件。

## 2. 当前基线快照

以下信息是 **2026-08-24** 整理本文时的快照，仅用于定位历史，后续同步后应更新：

- 二开分支：`hub`
- `hub` 提交：`9d3be0d9a`
- 当时的 `main` / `upstream/main`：`2d8e50bf3`
- 当时 `git merge-base upstream/main hub`：`7c28993f6`
- `hub` 最后吸收的上游基线约为 2026-07-12；整理时上游已经前进到 2026-08-24。
- `hub` 相对合并基线约有 59 个文件发生变化，约 3100 行新增、315 行删除。
- 本轮同步缓冲分支：`hub-merge-upstream`；先合入 `hub` 提交 `9d3be0d9a`，再合入上游 `main` 提交 `2d8e50bf3`。最终 merge commit 以本轮提交完成后的实际哈希为准。

提交哈希只是排查锚点。若以后 rebase、squash 或重建分支，应以本文描述的业务行为和验收结果为准。

## 3. 分支职责与标准同步流程

### 3.1 分支职责

| 分支 | 用途 | 约束 |
| --- | --- | --- |
| `main` | 纯上游镜像/跟踪分支 | 不放二开功能，不为了二开修改上游代码 |
| `hub` | 正式部署和发布的二开分支 | 保留本文列出的全部核心能力 |
| `hub-merge-upstream` | 上游同步缓冲分支 | 在这里解决冲突、构建失败和业务回归 |

### 3.2 推荐同步步骤

```bash
git switch main
git pull upstream main

git switch hub
git pull origin hub

git switch hub-merge-upstream
git merge hub
git merge main

# 解决冲突，执行后文的构建、测试和业务验收

git switch hub
git merge hub-merge-upstream
git push origin hub
```

如果 `hub-merge-upstream` 没有需要保留的独立提交，可以直接从最新 `hub` 重建：

```bash
git switch hub
git switch -C hub-merge-upstream hub
git merge main
```

不要在未完成验证时直接把同步缓冲分支合回 `hub`。

## 4. 核心业务不变量（必须保留）

### 4.1 OneHub / 旧 Token 兼容

#### 必须保留的行为

- Token 数据库查询使用的主体长度固定为 48。
- 支持迁移来的 59 位或更长 Token：数据库查询前截取前 48 位。
- 支持客户端携带 `sk-` 前缀。
- 支持在 48 位主体后使用 `#` 或 `-` 携带“指定渠道”参数。
- 不能简单使用 `strings.Split(key, "-")` 解析，否则普通旧 Token 中的连字符可能被误判为指定渠道参数。
- `TokenAuth` 与 `TokenAuthReadOnly` 必须复用等价的解析、前缀处理和 48 位截断规则。
- 指定渠道仍然只允许管理员使用；普通用户携带指定渠道参数时必须拒绝，并保持“普通用户不支持指定渠道”的安全边界。

#### 关键文件和符号

- `common/constants_key.go`
- `middleware/auth.go`
  - `TokenAuth`
  - `TokenAuthReadOnly`
  - `splitTokenKeyParts`
  - `SetupContextForToken`
- `model/token.go`
  - `ValidateUserToken`

#### 历史提交锚点

`26b5cdf13`、`663329559`、`61c0ab59e`、`298f2e6db`、`0e4943527`、`fc24bb79c`、`2187b2433`

#### 同步风险

上游修改鉴权中间件、Token 格式或指定渠道语法时，容易出现“代码能编译，但旧 Token 全部失效”或“普通用户被错误识别为指定渠道”的回归。应使用真实长度和分隔符组合做行为测试。

### 4.2 支付宝官方直连与微信支付官方直连

#### 必须保留的能力

- 支付宝官方直连支持：
  - 当面付 `facepay`
  - 电脑网站支付 `pagepay`
  - 手机网站支付 `wappay`
- 微信支付官方直连支持 Native 二维码支付。
- 支付宝、微信配置分别通过 `AlipayConfig`、`WxpayConfig` 存储。
- 在保留上游 Epay、Stripe、Waffo 等支付方式的同时，支持切换到支付宝/微信官方网关，不能用二开实现覆盖或删除上游支付能力。
- 保留二维码 PNG 输出接口、二维码弹窗、支付回调和移动端支付宝唤醒。
- 保留支付宝 `/notify` 兼容回调路由，避免未单独配置回调地址时失效。
- classic 和 default 两套前端都必须有可用的支付宝/微信配置入口。
- 充值历史应能显示支付来源或支付方式。

#### 关键路由

- `GET /api/qrcode`
- `GET /api/user/qrcode`
- `/api/notify`
- `/api/user/alipay/notify`
- `/api/user/wxpay/notify`

同步路由时要检查公开/鉴权边界。二维码在新窗口或支付页面中加载，不能因误加普通 API 鉴权而无法显示；支付回调也必须符合支付平台的实际调用方式。

#### 关键后端文件

- `controller/topup.go`
- `controller/topup_alipay_wxpay.go`
- `controller/qrcode.go`
- `router/api-router.go`
- `model/option.go`
- `setting/payment_alipay.go`
- `setting/payment_wxpay.go`
- `go.mod`
- `go.sum`

#### 关键前端文件

- `web/classic/src/components/topup/`
- `web/classic/src/components/settings/PaymentSetting.jsx`
- `web/classic/src/pages/Setting/Payment/`
- `web/default/src/features/system-settings/integrations/payment-settings-section.tsx`
- `web/default/src/features/system-settings/billing/`
- `web/default/src/features/system-settings/types.ts`
- classic/default 对应的多语言文件

上游前端目录经常重构。同步时应查找当前实际的充值页、支付设置页和类型定义，不要因旧路径消失就误删功能。

#### 关键依赖

- `github.com/skip2/go-qrcode`
- `github.com/smartwalle/alipay/v3`
- `github.com/wechatpay-apiv3/wechatpay-go`

同步 `go.mod`、`go.sum` 或 Docker 构建文件时，应确认这些依赖及其间接校验项没有丢失。

#### 历史提交锚点

`1fadb17e4`、`5e3a180f1`、`070695489`、`f3ec0bd61`、`0455f5837`、`4351f4cf7`、`9d3be0d9a`

根目录 `log.md` 还记录了 2026-02-01 的实现过程，以及 2026-03-20、2026-03-21 同步上游时的支付保留策略和依赖修复。

### 4.3 异步任务并行轮询

#### 背景

历史问题是在异步任务达到 1000 条以上时，全局或渠道内串行请求导致大量任务长期停留在 `NOT_START`；即使上游早已完成，本地也可能半小时后才同步状态。

#### 必须保留的行为

- 不能恢复成全局串行轮询。
- 默认单批查询数量为 1000：`defaultTaskPollingQueryLimit = 1000`。
- `constant.TaskQueryLimit > 0` 时使用配置值。
- 使用 ID 游标分批遍历“本轮开始时已经存在”的全部未完成任务，不能永远只处理第一批 1000 条。
- 视频任务按渠道并发处理。
- 同一渠道内的单个任务也通过 `gopool.Go` 并行请求。
- 每个 goroutine 必须创建并初始化独立 adaptor，避免在并发任务间共享可变状态。
- 本轮退出前等待已启动的 goroutine 完成，同时尊重 `context` 取消。
- 任务没有 upstream ID 时应标记失败，不能无限留在待处理状态。
- 不得破坏超时任务清理、状态 CAS 更新以及防止重复结算的逻辑。

#### 关键文件和符号

- `model/task.go`
  - `GetMaxUnfinishedSyncTaskID`
  - `GetUnfinishedSyncTasksBatch`
  - `HasUnfinishedSyncTasks`
- `service/task_polling.go`
  - `RunTaskPollingOnce`
  - `UpdateVideoTasks`
  - `updateVideoTasks`
  - `updateVideoSingleTask`
- `service/task_polling_test.go`

#### 历史提交锚点

`6621930fb`

### 4.4 管理员查看渠道密钥免二次验证

#### 必须保留的行为

- 最高权限管理员查看已经添加的渠道密钥时，不要求再次通过 2FA / Passkey，即对应查看密钥接口不挂载 `SecureVerificationRequired()`。
- 必须继续保留 `RootAuth()` 或当前等价的最高权限授权。
- 必须继续保留原接口的限流、缓存控制和其他安全中间件。
- 不能为了免二次验证而把接口降级成普通管理员或普通用户可访问。

#### 关键文件

- `router/channel-router.go`

#### 历史提交锚点

`03709d368`

### 4.5 管理员全局记录所有用户 IP

#### 必须保留的行为

- 普通用户开启 `RecordIpLog` 时，只记录该用户自己的客户端 IP。
- 任一管理员开启 `RecordIpLog` 时，所有用户的消费日志和错误日志都记录客户端 IP。
- 管理员全局开关允许使用 1 分钟缓存，避免每条日志都查询数据库。
- 用户设置更新后必须清理管理员 IP 开关缓存，避免开关状态长时间不生效。
- 只影响开关开启后的新日志，不补录历史日志。
- 前端管理员说明文字必须明确表达“将记录所有用户”，普通用户仍显示个人范围说明。
- 多语言文案必须同步维护，不能只改中文或英文。

#### 关键文件和符号

- `model/log.go`
  - `shouldRecordRequestIP`
  - `adminRecordIpLogEnabled`
  - `clearAdminRecordIpLogCache`
- `model/user.go`
- `model/log_ip_test.go`
- `web/default/src/features/profile/components/tabs/notification-tab.tsx`
- `web/default/src/i18n/locales/*.json`

历史聊天中前端文件曾位于 `notification-settings-card.tsx`；上游重构后当前路径已经迁移到 `tabs/notification-tab.tsx`。以后仍应按当前代码结构定位实际开关，而不是强行恢复旧文件。

#### 历史提交锚点

`a8124f274`

### 4.6 OpenAI 流式错误不能被判为成功或误扣费

#### 必须保留的行为

- OpenAI SSE 流中出现错误对象时，流处理必须把该错误返回到上层。
- 已出现流错误的请求不能继续按照成功响应结算或扣费。
- 同步时按可观察行为核验，不能只机械保留某个局部变量；如果上游重构了流处理，需要把错误传播语义迁移到新结构中。

#### 关键文件

- `relay/channel/openai/relay-openai.go`

当前二开差异包含 `streamErr` 检查，但最终验收标准是“流内错误能够中止成功结算”。

#### 历史提交锚点

`1a5ba701e`、`39d2ad161`

### 4.7 Classic 前端渠道启用/停用

#### 必须保留的行为

- classic 前端必须能够启用和禁用渠道。
- 主调用路径使用 `POST /api/channel/:id/status`，不能重新依赖已被上游拒绝或限制的通用 `PUT` status 更新方式。
- 后端可以保留只允许修改 status 的兼容入口，但不能让普通更新接口绕过专用状态变更约束。
- 状态修改后必须重建 channel cache 和 proxy client cache，避免界面状态已经改变但实际转发仍使用旧缓存。
- classic 页面不显示已删除的 deprecation banner。

#### 关键文件

- `web/classic/src/hooks/channels/useChannelsData.jsx`
- `web/classic/src/components/layout/PageLayout.jsx`
- `controller/channel.go`
- `model/channel.go`

#### 历史提交锚点

`645d0b013`、`b65a55425`

### 4.8 `hub` / `hub0` 专用 Docker 镜像发布

#### 必须保留的行为

- push 到 `hub` 或 `hub0` 时触发，也支持手动触发。
- 构建平台为 `linux/amd64`。
- 推送以下标签：
  - `ghcr.io/<repo>:hub`
  - `ghcr.io/<repo>:hub-YYYYMMDD-<sha>`
- 使用 GitHub Actions 构建缓存。
- `provenance: false`
- `sbom: false`

#### 关键文件

- `.github/workflows/docker-image-hub.yml`

#### 历史提交锚点

`a2aa2073f`、`b366fdc92`、`d5db47c8d`、`c66e81ef0`

### 4.9 Classic / 老 UI 必须长期保留

#### 必须保留的行为

- `web/classic/` 是正式支持的老 UI，不能因为上游删除 classic UI 而接受整棵目录删除。
- 新 UI 继续使用 `web/` 根目录的当前上游实现；classic UI 独立保留，二者不能互相覆盖构建产物。
- classic 依赖安装必须使用 `web/package.workspace.json` 和 `web/bun.lock.workspace` 提供的独立 workspace 入口；上游删除旧 default workspace 后，该清单只声明 `classic`，避免冻结安装继续依赖已不存在的 `web/default/package.json`。
- `Dockerfile` 必须分别构建新 UI 的 `web/dist` 和 classic UI 的 `web/classic/dist`，并把两套产物都复制进 Go builder。
- `main.go` 必须同时 embed 新 UI 与 classic UI；`router/web-router.go` 必须继续按 `common.GetTheme() == "classic"` 选择 `ClassicBuildFS` / `ClassicIndexPage`。
- classic UI 中的支付宝/微信支付入口、渠道启用/停用和多语言能力必须继续可用。
- 上游同步出现 classic 删除、workspace 删除、Docker 构建删除或 Go embed 删除时，必须显式恢复完整链路，不能仅保留源码目录却让 classic 无法构建或无法访问。

#### 关键文件和路径

- `web/classic/`
- `web/package.workspace.json`
- `web/bun.lock.workspace`
- `Dockerfile`
- `main.go`
  - `classicBuildFS`
  - `classicIndexPage`
- `router/web-router.go`
  - `ClassicBuildFS`
  - `ClassicIndexPage`
  - theme 切换逻辑
- `controller/theme_compat_test.go`
  - Classic theme 设置接口契约
  - `/api/status` 的 theme 发布契约

上游若新增“Classic 已删除”或“只能使用 default”的测试，必须改为验证二开真实契约，不能为了让上游测试通过而关闭 Classic。

#### 验收要求

- 新 UI：在 `web/` 执行 `bun install --frozen-lockfile` 和 `bun run build`。
- classic UI：按 `Dockerfile` 的 workspace 方式安装并执行 `classic` 的 `bun run build`。
- 后端构建时确认 `web/dist` 与 `web/classic/dist` 均存在并可被 embed。
- 运行态分别选择 default/classic theme，确认页面资源、支付入口和渠道状态操作正常。

## 5. 条件性构建兼容项（按上游现状判断）

以下内容来自历史合并或构建修复，但不是稳定的独立业务需求。未来同步时不能无脑保留旧实现；只有上游当前结构仍然需要时才继续保留：

| 文件或处理 | 保留条件 |
| --- | --- |
| `web/default/src/styles/fonts.css` | 当前 default 前端仍引用该字体资源，且移除后会导致构建失败或字体回退异常 |
| `web/classic/package.json` 中的 `date-fns` / `date-fns-tz` | classic 当前代码仍直接依赖这些包 |
| `web/classic/rsbuild.config.ts` 中的 `date-fns` alias | 当前依赖解析仍需要该 alias；若上游已经修正，应采用上游方案 |
| `web/bun.lock` 的相关差异 | 必须与实际 package 声明和 `bun install` 结果一致，不能手工长期冻结无效条目 |
| `notification-tab.tsx` 中的 JSX 合并修复 | 仅在同类 JSX 冲突或构建错误仍存在时保留正确结构 |
| `web/default/src/features/usage-logs/data/schema.ts` | 该文件曾因上游合并缺失而恢复，但当前已被后续上游吸收或重构；不要强制恢复旧路径 |
| `.agents/skills/i18n-translate/SKILL.md` | 当前只有文件 mode 差异，不属于二开业务功能 |
| `web/src/pages/Setting/Payment/SettingsPaymentGateway.jsx` | 旧前端布局遗留；应以当前实际启用的 classic/default 支付设置入口为准 |

相关历史构建修复提交：`69865d9fb`、`e0c1939c0`、`daa536568`、`94647410e`、`9c56d7058`。

处理这类冲突的原则是：优先使用上游已经成熟的新实现，只补回当前仍缺失的兼容逻辑，不要为保留旧文件而逆向覆盖上游重构。

## 6. 冲突处理原则

### 6.1 优先保留本地行为的区域

遇到以下区域冲突时，先确认二开行为完整，再吸收上游变化：

- OneHub/旧 Token 解析和查询；
- 支付宝、微信官方支付和二维码链路；
- 异步任务批量遍历和并行轮询；
- 管理员查看渠道密钥的二次验证策略；
- 管理员全局 IP 日志策略；
- OpenAI SSE 错误传播和结算；
- classic 渠道状态操作；
- `hub` Docker 发布工作流。

这不等于整文件选择 `ours`。应先理解上游改动，再把本地不变量移植到上游的新结构中。

### 6.2 优先吸收上游实现的区域

通用重构、公共基础设施、类型升级、非二开供应商适配、公共日志增强和安全修复，原则上优先采用上游版本，然后检查是否影响本文列出的二开行为。

### 6.3 支付冲突特别规则

支付相关文件常同时包含上游新增支付方式和本地支付宝/微信直连。不能简单选择 `ours` 或 `theirs`：

- 保留上游 Epay、Stripe、Waffo 等新增/调整；
- 合入本地支付宝/微信配置、下单、二维码、回调和前端入口；
- 检查统一订单、支付方式枚举、充值记录展示和 i18n 是否覆盖所有支付来源；
- 检查 `go.mod` / `go.sum` 是否同时包含所有实际使用的支付 SDK。

### 6.4 2026-08-24 上游同步冲突决策

本轮 `hub-merge-upstream` 合入 `hub@9d3be0d9a` 和 `main@2d8e50bf3` 时，以下决策必须作为后续同步参考：

- `main.go`：同时保留 classic UI embed，并吸收上游 `kitutil` 日志接入和 `middleware.ConfigureTrustedProxies`。
- `model/channel.go`：采用上游贯穿读取到持久化的 channel polling lock 与 `saveStatusState` 字段白名单，避免旧快照覆盖密钥、计数或配置；同时保留 classic 状态操作在 memory cache miss 时继续落库的兼容语义。
- `relay/channel/openai/relay-openai.go`：在上游 `StreamScannerHandler` / `StreamResult` API 上识别 SSE error chunk，写回错误数据、将 HTTP 200 流内错误映射为 400、调用 `sr.Stop` 并向上层返回错误，禁止进入成功 usage/结算链路。
- `service/task_polling.go`：保留 1000 条批次、ID 游标遍历、跨渠道并行、同渠道逐任务并行，以及每个任务独立 adaptor/RelayInfo；采用上游新的退款/配额语义，不恢复已经被上游移除的旧失败退款对账方法。
- classic UI：上游删除老 UI 的变更不接受，继续保留 `web/classic`、独立 workspace、双前端 Docker 构建、双 embed 和 theme 路由切换；同步修改 `controller/theme_compat_test.go`，使测试验证 Classic 可选而不是断言 Classic 已移除。

## 7. 同步前检查清单

- [ ] `main` 已拉取最新 `upstream/main`。
- [ ] `hub` 已拉取最新 `origin/hub`。
- [ ] 工作区没有混入本地配置、密钥、虚拟主机文件或其他未跟踪文件。
- [ ] 已记录同步前的 `hub`、`main` 和 merge-base 提交。
- [ ] 已阅读上游自上次基线以来与鉴权、支付、任务、日志、渠道和流式结算有关的提交。
- [ ] 所有合并操作都在 `hub-merge-upstream` 中进行。

## 8. 同步后代码与构建检查

### 8.1 Git 基础检查

```powershell
git diff --check
git status --short
git diff --stat hub...hub-merge-upstream
```

同时检查是否误提交了本地配置、构建产物、密钥或临时文件。

### 8.2 后端建议验证

先运行与二开能力直接相关的包：

```powershell
go test ./model ./router ./service ./relay/channel/openai
go build ./...
```

条件允许时再运行完整测试：

```powershell
go test ./...
```

如果同步影响 `relaykit/` 或其公共 API，还必须独立验证：

```powershell
cd relaykit
$env:GOWORK = 'off'
go build ./...
```

### 8.3 前端建议验证

```powershell
cd web
bun install --frozen-lockfile
bun run build

# 仍在 web/ 目录
bun install --filter ./classic --frozen-lockfile
cd classic
bun run build
```

本项目要求长期保留新 UI 和 classic 双前端；必须确认两套前端均实际参与构建并通过，不能只验证新 UI。classic 应按 `web/package.workspace.json` / `web/bun.lock.workspace` 的独立 workspace 方式验证。

## 9. 同步后业务验收清单

### Token 与权限

- [ ] 48 位 Token 正常鉴权。
- [ ] 59 位或更长的 OneHub 迁移 Token 可通过截取前 48 位鉴权。
- [ ] 带 `sk-` 前缀的 Token 正常鉴权。
- [ ] 48 位主体后使用 `#` 指定渠道时解析正确。
- [ ] 48 位主体后使用 `-` 指定渠道时解析正确。
- [ ] 普通旧 Token 不会因为连字符被误判成指定渠道。
- [ ] 普通用户不能使用指定渠道参数。
- [ ] `TokenAuthReadOnly` 与普通 Token 鉴权行为一致。
- [ ] 最高权限管理员无需 2FA / Passkey 即可查看已添加渠道的密钥。
- [ ] 普通用户或非授权管理员不能访问渠道密钥接口。

### 支付

- [ ] 支付宝当面付能够创建订单并展示二维码。
- [ ] 支付宝电脑网站支付能够跳转并完成回调。
- [ ] 支付宝手机网站支付能够跳转或唤醒支付宝并完成回调。
- [ ] 微信 Native 支付能够创建订单、展示二维码并完成回调。
- [ ] `/notify` 支付宝兼容回调有效。
- [ ] 二维码 PNG 接口在实际支付页面中可加载，不被错误鉴权拦截。
- [ ] 重复回调不会重复充值。
- [ ] Epay、Stripe、Waffo 等上游支付方式没有因合并而回退。
- [ ] classic 和 default 都能配置支付宝/微信。
- [ ] 充值历史正确显示支付来源或方式。

### 异步任务

- [ ] 超过 1000 条未完成任务时，不会永远只处理第一批。
- [ ] 同一渠道内任务不是逐条全局串行请求。
- [ ] 不同渠道可并发轮询。
- [ ] 每个并发任务使用独立 adaptor，没有共享状态竞态。
- [ ] 没有 upstream ID 的任务会失败收敛。
- [ ] 超时清理、CAS 更新和结算防重逻辑正常。
- [ ] context 取消后轮询可以正常退出。

### 日志、流式结算和渠道

- [ ] 普通用户开启 IP 记录时只记录自己的日志。
- [ ] 任一管理员开启 IP 记录后，普通用户的消费日志和错误日志也记录 IP。
- [ ] 修改管理员开关后缓存能及时失效。
- [ ] 管理员和普通用户看到的 IP 记录说明文案范围正确，所有语言文件已同步。
- [ ] OpenAI SSE 返回错误时请求不会被判成功或继续扣费。
- [ ] classic 前端可以启用和停用渠道。
- [ ] 渠道状态修改后 channel cache 和 proxy client cache 已刷新。
- [ ] 新 UI 与 classic UI 均能独立构建，Docker 同时包含两套产物。
- [ ] theme 设为 `classic` 时由后端返回 classic 资源；其他主题返回新 UI 资源。

### 发布

- [ ] `hub` / `hub0` push 或手动触发能运行专用 Docker workflow。
- [ ] 能生成 `hub` 和 `hub-YYYYMMDD-<sha>` 两类 GHCR 标签。
- [ ] 构建平台和 provenance/SBOM 配置符合本文要求。

## 10. 常用排查命令

查找某项二开代码是否仍存在：

```powershell
git grep -n "splitTokenKeyParts"
git grep -n "AlipayConfig"
git grep -n "WxpayConfig"
git grep -n "defaultTaskPollingQueryLimit"
git grep -n "adminRecordIpLogEnabled"
git grep -n "SecureVerificationRequired" -- router/channel-router.go
git grep -n "streamErr" -- relay/channel/openai/relay-openai.go
```

查看历史提交：

```powershell
git show <提交哈希>
git log --oneline --all -- <文件路径>
git diff <旧上游基线>..<新上游> -- <文件路径>
```

比较二开与共同基线：

```powershell
git merge-base upstream/main hub
git diff upstream/main...hub --stat
git log --oneline $(git merge-base upstream/main hub)..hub
```

## 11. 文档维护要求

每次二开代码、配置、前端、工作流、兼容或行为发生变化时，必须在同一个提交或同一批 PR 中**同时更新根目录 `log.md` 和本文档**：

- `log.md` 记录日期、改了什么、为什么、关键路径和实际验证结果；
- 本文档描述长期业务不变量、与上游冲突时的保留策略、当前真实代码路径和可重复验收步骤；
- 添加关键提交锚点；
- 上游同步必须记录新旧基线、冲突决策和每项二开能力的保留结果；
- 上游重构导致路径变化时，更新路径并保留业务不变量；
- 已被上游正式实现且行为完全等价的能力，可从“本地实现”改为“上游实现核验项”，但不能未经验证直接删除记录；
- `main` 是纯上游分支，不得提交这些二开记录；记录只维护在 `hub`、`hub0` 或 `hub-merge-upstream` 的对应变更中。

`log.md` 与本文档是同一批二开变更的强制交付物：缺少任一文件更新，都视为二开记录不完整。

## 12. 2026-08-24 上游同步结果

### 输入基线

- 二开输入：`hub@9d3be0d9a`
- 上游输入：`main/upstream-main@2d8e50bf3`
- 中间分支：`hub-merge-upstream`
- 本轮只完成中间分支合并，不合回 `hub`，不 push。

### 二开保留结果

- OneHub / 旧 Token 兼容：保留。
- 支付宝与微信官方直连、二维码和兼容回调：保留。
- 异步任务 1000 条批次、ID 游标、跨渠道并行、同渠道逐任务并行、独立 adaptor：保留，并适配上游 CAS/退款语义。
- 管理员查看渠道密钥免二次验证：保留，路由仍使用 `RootAuth` 且未加入 `SecureVerificationRequired`。
- 管理员全局 IP 日志：保留。
- OpenAI SSE 错误传播与防误扣费：保留，并适配上游 `StreamScannerHandler` / `StreamResult`。
- Classic 渠道启停：保留。
- Hub Docker workflow：保留。
- Classic / 老 UI：完整保留；workspace 已从已失效的 `default + classic` 调整为仅管理 `classic`。

### 冲突与回归处理

- `main.go`：保留双 embed，同时接入上游 relaykit 日志和 trusted proxies。
- `model/channel.go`：采用上游轮询锁与安全字段持久化，同时保留 cache miss 后继续写数据库。
- `relay/channel/openai/relay-openai.go`：流内 error chunk 会停止扫描、向上返回错误并阻止成功结算。
- `service/task_polling.go`：移除上游同渠道顺序 sleep 轮询，恢复逐任务并发和独立 adaptor/RelayInfo。
- `controller/theme_compat_test.go`：移除“Classic 已删除”的上游断言，改为保护 Classic 可选和状态接口发布契约。
- `web/package.workspace.json` / `web/bun.lock.workspace`：不再引用上游已经删除的 `web/default/package.json`。

### 验证记录

- `bun install --filter ./classic --frozen-lockfile`：通过，无 lockfile 变化。
- Classic `bun run build`：通过。
- 新 UI `bun run build`：通过。
- OpenAI SSE 定向回归测试：通过。
- 任务轮询同渠道/跨渠道并发定向测试：通过。
- `go test ./model ./router ./service ./relay/channel/openai`：通过。
- `go test ./controller -count=1`：通过。
- `go build ./...`：通过。
- `cd relaykit; GOWORK=off go build ./...`：通过。
- 完整 `go test ./...`：通过。首次执行发现上游遗留的两项测试仍断言 Classic 已移除；将其改为保护 Classic 可选契约后重新执行，全量通过。
