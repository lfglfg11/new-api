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
- `hub` 当前提交：`74a6dec3c`（已合入本轮 `hub-merge-upstream`；同步前二开输入为 `9d3be0d9a`）
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

### 4.10 `/v1/videos` 固定价模型按次/按秒计费

#### 必须保留的行为

- 系统设置 `billing_setting.billing_mode` 支持以下显式模式：
  - `per_request`：固定价格按一次异步任务计费。
  - `per_second`：固定价格乘以请求/适配器解析出的生成秒数等任务倍率。
  - `tiered_expr`：继续使用现有表达式计费，不得被按次/按秒逻辑覆盖。
- 显式系统设置的优先级高于环境变量 `TASK_PRICE_PATCH`：
  - 模型显式设为 `per_second` 后，即使仍在 `TASK_PRICE_PATCH` 中也必须按秒计费，因此新增按秒模型不再需要修改环境变量白名单。
  - 模型显式设为 `per_request` 后，即使不在白名单中也必须按次计费。
- 未显式设置时必须保留旧部署兼容逻辑：
  - `/v1/videos` 固定价模型位于 `TASK_PRICE_PATCH` 时按次。
  - `/v1/videos` 固定价模型不在 `TASK_PRICE_PATCH` 时按秒，并应用 `seconds`、尺寸等 `OtherRatios`。
  - 非视频固定价模型默认按次。
- 任务提交预扣和适配器 `AdjustBillingOnSubmit` 的倍率重算必须使用同一个计费单位解析规则，不能出现“界面显示按秒但实际按次”或相反的情况。
- `/api/pricing` 对固定价模型发布 `task_billing_unit`（`request` / `second`），并在存在显式配置时发布 `billing_mode`（`per_request` / `per_second`）。
- default 与 Classic 两套模型广场都必须同时支持：
  - 固定价格单位 `/ request` 与 `/ second`（中文对应 `/ 次` 与 `/ 秒`）。
  - `Per Request` / `Per Second` Badge。
  - 按次与按秒独立筛选、独立数量统计。
  - 计费标签必须有清晰的视觉区分：Classic 中按次使用青绿色 `teal`，按秒使用醒目的亮橙色 `orange`；上游同步时不得恢复为视觉相近的 `teal` / `cyan`。
- default 与 Classic 两套系统设置中的模型定价可视化编辑器，都必须提供“按量计费、按次计费、按秒计费、表达式/阶梯计费”四种模式；保存固定价时把显式单位写入 `billing_setting.billing_mode`，重新打开时正确回显。
- 上游删除或重构 Classic 时，不能只保留新 UI 的按秒实现；Classic 的设置入口、价格单位、Badge、筛选和数量统计属于同一业务能力，必须一起恢复。
- 上游价格同步 `/api/pricing` 必须能够导入 `per_request`、`per_second` 和有效的 `tiered_expr`，避免同步后丢失计费单位。

#### 关键后端文件和符号

- `setting/billing_setting/tiered_billing.go`
  - `GetExplicitBillingMode`
  - `ResolveTaskBillingUnit`
  - `ShouldApplyTaskBillingRatios`
- `relay/relay_task.go`
  - 任务 `EstimateBilling` 后的 `OtherRatios` 应用
  - `AdjustBillingOnSubmit` 后的额度重算
- `service/task_billing.go`
- `model/pricing.go`
- `controller/ratio_sync.go`
- `setting/billing_setting/task_billing_test.go`
- `model/pricing_task_billing_test.go`

#### 关键前端文件

- `web/src/features/system-settings/models/model-pricing-core.ts`
- `web/src/features/system-settings/models/model-pricing-sheet.tsx`
- `web/src/features/system-settings/models/model-pricing-snapshots.ts`
- `web/src/features/system-settings/models/model-ratio-visual-editor.tsx`
- `web/src/features/system-settings/models/model-ratio-table-columns.tsx`
- `web/src/features/pricing/types.ts`
- `web/src/features/pricing/lib/model-helpers.ts`
- `web/src/features/pricing/lib/filters.ts`
- `web/src/features/pricing/components/model-billing-mode-badge.tsx`
- `web/src/features/pricing/components/model-card.tsx`
- `web/src/features/pricing/components/pricing-columns.tsx`
- `web/src/features/pricing/components/pricing-sidebar.tsx`
- `web/src/features/system-settings/models/__tests__/model-pricing-billing-unit.test.ts`
- `web/src/i18n/locales/*.json`
- `web/classic/src/pages/Setting/Ratio/components/ModelPricingEditor.jsx`
- `web/classic/src/pages/Setting/Ratio/hooks/useModelPricingEditorState.js`
- `web/classic/src/helpers/utils.jsx`
- `web/classic/src/components/table/model-pricing/`
- `web/classic/src/hooks/model-pricing/`
- `web/classic/src/i18n/locales/*.json`

#### 验收要求

- 分别打开 default 与 Classic 的“模型定价设置 → 可视化编辑”，确认同时存在按量、按次、按秒、表达式/阶梯四个选项。
- 在 Classic 中把固定价模型设为按秒并保存，确认 `billing_setting.billing_mode` 写入 `per_second`，刷新后仍回显按秒；改为按次时对应写入并回显 `per_request`。
- 使用包含 `task_billing_unit=second`、显式 `billing_mode=per_second`、显式 `billing_mode=per_request` 的 `/api/pricing` 数据验收两套模型广场，确认 Badge、`/秒` / `/次` 单位、筛选结果和数量统计一致，并确认 Classic 卡片、表格和详情中的按秒标签为亮橙色、按次标签为青绿色。
- Classic 前端执行 `bun run build`，并在生产镜像切换到 Classic theme 后做实际页面验收；不能只检查新 UI 构建产物。

#### 同步风险

上游可能继续直接用 `TASK_PRICE_PATCH` 判断是否跳过任务倍率，也可能重构模型广场或模型定价编辑器。同步时不能只保留环境变量兼容分支，也不能只检查 default 新 UI；必须保留“显式系统设置优先、环境变量仅作未配置时兜底”的业务优先级，并逐项确认 default 与 Classic 的展示单位、Badge、筛选、保存值和实际预扣费使用同一解析结果。

### 4.11 Classic UI 必须适配 Dashboard 无状态认证协议

#### 背景与根因

上游认证提交 `31d70fca3` 将 Dashboard 登录从旧 Session 协议迁移为 Auth Bundle、短期 Access Token、HttpOnly Refresh Cookie 和可控登录会话。Classic UI 虽然作为二开被保留，但旧代码仍把登录接口整个 `data` 当作用户对象写入 `localStorage`，后续请求也没有携带 `Authorization: Bearer ...`。生产环境因此出现：

```text
POST /api/user/login 200
GET /console 200
GET /api/user/self 401
GET /login?expired=true 200
```

这类问题不是“Classic 静态资源没打包”，而是“UI 外观保留了、认证协议没有一起迁移”。

#### 长期业务不变量

> 保留 Classic UI 时，必须持续适配上游 Dashboard 无状态 Token 协议，包括 Auth Bundle、内存 Access Token、HttpOnly Refresh Cookie bootstrap、Bearer 请求头、401 单次刷新重试、Session mismatch/race、2FA flow token、Passkey flow token、OAuth state POST 协议和新注销端点。后续同步上游时不能只保留 UI 外观而遗漏认证协议。

必须保留：

- 登录成功响应按 Auth Bundle 解析，只把 `bundle.user` 作为 Classic 用户资料保存；不能把 `access_token`、`session` 等整个 Bundle 当用户对象写入 `localStorage.user`。
- Access Token 只保存在页面运行时内存，不写 localStorage；刷新页面后通过同源 HttpOnly Refresh Cookie 调用 `POST /api/user/auth/refresh` 恢复。
- Classic API 客户端必须启用 `withCredentials`，受保护请求动态附加 Bearer；`New-API-User` 继续从当前用户资料读取以兼容后端请求约束。
- 普通 API 收到 401 时最多执行一次 Refresh 和一次原请求重试，避免无限循环。
- 并发 Refresh 必须单飞；`AUTH_REFRESH_RACE` 按短延迟有限重试，`AUTH_SESSION_MISMATCH` 清除旧 SID 后只允许一次无 SID 恢复。
- Refresh 返回 401 或确认会话失步时才能清理认证并跳转 `/login?expired=true`；网络失败、429、5xx 等暂时性错误不能直接删除用户登录态。
- 2FA 登录必须把初次密码登录返回的 `flow_token` 提交到 `/api/user/login/2fa`。
- Passkey 登录 begin 返回的 `flow_token` 必须和 `credential` 一起提交到 `/api/user/passkey/login/finish`。
- OAuth state 必须使用 `POST /api/oauth/state`，请求体包含正确的 `provider`、`intent=login|bind` 和登录场景的 `aff`；登录回调必须按 Auth Bundle 落地。
- 注销必须调用 `POST /api/user/auth/logout`，并携带当前 Bearer/SID；不得恢复已删除的旧 `GET /api/user/logout`。
- `updateAPI()` 重建 Axios 实例时必须重新安装请求、401 Refresh、错误处理和 GET 去重逻辑，不能退回只设置静态头的旧实现。

#### 当前实现路径

- `web/classic/src/helpers/auth-session.js`
  - 内存认证状态、Auth Bundle 校验和落地
  - Refresh 单飞、race/mismatch 恢复、bootstrap、logout
- `web/classic/src/helpers/api.js`
  - `withCredentials`、动态 Bearer、401 单次刷新重试
  - OAuth state POST 与 provider/intent/aff
- `web/classic/src/helpers/auth.jsx`
  - `authHeader()` 从运行时 Access Token 生成 Bearer
- `web/classic/src/components/auth/LoginForm.jsx`
- `web/classic/src/components/auth/TwoFAVerification.jsx`
- `web/classic/src/components/auth/OAuth2Callback.jsx`
- `web/classic/src/components/auth/RegisterForm.jsx`
  - 密码、微信、Telegram、OAuth、2FA、Passkey 登录入口
- `web/classic/src/components/layout/PageLayout.jsx`
  - 页面启动 Refresh Cookie bootstrap
- `web/classic/src/hooks/common/useHeaderBar.js`
- `web/classic/src/components/settings/PersonalSetting.jsx`
  - 新注销协议与账户删除后的本地认证清理

#### 上游同步保留策略

每次上游修改 `controller/auth_session.go`、`controller/user.go`、`controller/twofa.go`、`controller/passkey.go`、`controller/oauth.go`、`router/api-router.go`、`middleware/auth*.go` 或新 UI 的 `web/src/lib/auth-session.ts` / `web/src/features/auth/` 时：

1. 先以新 UI 当前实现和后端接口为协议基准，列出登录、Refresh、会话、2FA、Passkey、OAuth、注销的请求/响应变化。
2. 再把等价行为迁移到 `web/classic`，不要直接复制依赖 Zustand、TanStack Query 或路径别名的代码。
3. 冲突处理不得选择“保留 Classic 旧文件即完成”；需要逐项完成下方验收。
4. Access Token 的长期存储策略不可为了省事改回 localStorage。

#### 可重复验收

- [ ] 密码登录成功后 `localStorage.user` 只包含用户资料，不包含 Access Token；`/api/user/self` 带 Bearer 并返回 200。
- [ ] 刷新 `/console` 后，Classic 通过 HttpOnly Refresh Cookie 恢复 Access Token，不白屏、不误跳登录。
- [ ] Access Token 过期后只发生一次 `401 -> Refresh -> 原请求重试`，最终请求成功。
- [ ] Refresh Cookie 失效时才清理用户并跳转 `/login?expired=true`；Refresh 5xx、429、网络故障不会立即登出。
- [ ] `AUTH_REFRESH_RACE` 和 `AUTH_SESSION_MISMATCH` 均按有限恢复策略处理，无刷新风暴或无限循环。
- [ ] 2FA 请求携带初次登录返回的 `flow_token`。
- [ ] Passkey finish 请求携带 `flow_token + credential`。
- [ ] GitHub、Discord、OIDC、LinuxDO、自定义 OAuth 使用正确 provider；登录用 `intent=login`，账户绑定用 `intent=bind`。
- [ ] 注销调用 `POST /api/user/auth/logout`，成功后内存认证和 `localStorage.user` 均被清理。
- [ ] Classic 首页、登录页、控制台、账户设置仍能正常显示和操作。

#### 基线与验证记录（2026-08-24）

- 上游无状态认证基线：`31d70fca3`
- 本轮上游同步基线：`2d8e50bf3`
- 当前 `hub` 基线：`74a6dec3c`
- Classic `bun run build`：通过。
- 根模块 `go build ./...`：通过。
- 本次修改文件定向 `prettier --check`：通过。
- `bun run eslint`：未通过，原因是项目现有 ESLint/AJV 依赖初始化错误（`defaultMeta` / `missingRefs`），不是本次 JSX/JS 构建错误。
- 全目录 `bun run lint`：未通过，包含项目既有未格式化文件；曾与构建并行扫描 `dist` 临时文件。本次修改文件应使用定向 `prettier --check` 验证。
- 生产镜像尚未包含本修复；在新 `hub` 镜像发布并重新拉取前，服务器继续运行旧行为。

### 4.12 Classic 模型广场管理员快捷配置

#### 长期业务不变量

> Classic 模型广场的卡片视图必须为管理员提供就地配置模型元数据的快捷入口：已有元数据配置的模型点击后进入编辑模式并完整载入原始配置；尚未配置的模型进入创建模式并精确预填当前卡片的完整 `model_name`。普通用户和未登录访问者不能看到该按钮。

必须保留：

- 前端展示权限使用当前登录用户角色判断，仅 `role >= 10` 渲染快捷编辑按钮。
- 按钮点击必须阻止卡片点击事件，不能同时打开模型详情侧滑页。
- 快捷入口必须复用模型管理现有的 `EditModelModal`，不复制第二套表单，也不新增独立编辑接口。
- `/api/pricing` 必须为实际命中的数据库模型元数据记录返回 `model_meta_id`；精确、前缀、包含、后缀匹配都要指向卡片当前继承配置的来源记录。
- 有 `model_meta_id` 时传入 `{ id: model_meta_id, model_name: 当前模型名称 }`，由 `GET /api/models/:id` 加载图标、描述、标签、供应商、端点、状态、参与官方同步和名称匹配方式等完整原始配置，并通过现有 `PUT /api/models/` 更新。
- 无 `model_meta_id` 时传入 `{ id: undefined, model_name: 当前模型名称 }`，按创建模式精确预填模型名称，并通过现有 `POST /api/models/` 创建。
- 规则匹配场景必须编辑实际来源规则。例如前缀规则 `gpt-` 为卡片 `gpt-4o` 提供元数据时，表单应加载并编辑 `gpt-` 规则本身，不能误创建一条新的 `gpt-4o` 精确规则。
- `GET /api/models/:id`、`POST /api/models/` 和 `PUT /api/models/` 继续由 `middleware.AdminAuth()` 保护；前端隐藏和 Pricing 中的整数 ID 都不能替代后端鉴权。
- 创建或更新成功后刷新 `/api/pricing` 数据，使模型广场及时显示最新元数据。

#### 当前实现路径

- `model/pricing.go`
  - `Pricing` 响应增加可选 `model_meta_id`。
  - 在应用精确或规则匹配元数据时，同时发布实际来源记录 ID；系统自动推断但未落库的默认元数据保持 ID 为空。
- `model/pricing_endpoint_test.go`
  - 回归保护精确匹配和前缀规则匹配都返回正确的元数据来源 ID。
- `web/classic/src/components/table/model-pricing/layout/PricingPage.jsx`
  - 根据 `userState.user.role` 判断管理员身份。
  - 根据 `model_meta_id` 选择 `EditModelModal` 的编辑或创建模式。
- `web/classic/src/components/table/model-pricing/view/card/PricingCardView.jsx`
  - 在卡片右上角渲染管理员专属编辑按钮。
  - 阻止事件冒泡并传递完整 Pricing 模型对象。
- `web/classic/src/components/table/models/modals/EditModelModal.jsx`
  - 复用既有按 ID 查询和完整表单回显能力，不维护模型广场专用表单副本。

#### 上游同步保留策略

- 上游调整 `Pricing` DTO 或 `updatePricing()` 元数据匹配逻辑时，保留 `model_meta_id` 与“实际来源记录”映射，尤其不能在规则匹配时退化为卡片模型名查找。
- 上游调整模型广场卡片布局时，将快捷按钮迁移到新的卡片操作区，不能因卡片组件重构而静默丢失。
- 上游调整模型管理表单路径、props 或模型详情 API 时，继续复用其完整编辑入口；不要复制表单实现，以避免图标、描述、标签、供应商、端点及后续新增字段发生漂移。
- 上游调整用户角色状态结构时，重新确认管理员阈值仍为 `role >= 10`，并确认模型详情、创建和更新接口仍有管理员中间件保护。

#### 可重复验收

- [ ] 管理员打开 Classic 模型广场卡片视图时，每张模型卡片右上角显示编辑按钮。
- [ ] 普通用户和未登录访问者打开同一页面时不渲染编辑按钮。
- [ ] 点击编辑按钮只打开模型编辑/创建侧滑表单，不同时打开模型详情。
- [ ] 已存在精确元数据的模型进入编辑模式，图标、描述、标签、供应商、端点、状态、参与官方同步和匹配方式均与数据库原配置一致。
- [ ] 由前缀、包含或后缀规则提供元数据的卡片进入编辑模式后，加载并更新实际来源规则记录。
- [ ] 没有落库元数据的模型进入创建模式，模型名称完整等于卡片 `model_name`，名称匹配类型默认为精确匹配。
- [ ] 创建或更新成功后侧滑表单关闭，模型广场刷新并显示最新元数据。
- [ ] 非管理员直接调用模型详情、创建或更新接口时仍被后端拒绝。
- [ ] 卡片原有复制、选择和打开详情操作不受影响。
- [ ] `go test ./model -count=1`、`go build ./...`、Classic 定向 Prettier、`bun run build` 与 `git diff --check` 通过。

### 4.13 登录、Refresh 与其他关键接口必须使用隔离限流桶

#### 背景与生产根因

生产环境虽然把 `GLOBAL_API_RATE_LIMIT` 提高到了较大值，但认证请求仍会经过默认 Critical 限流（`20 次 / 1200 秒`）。旧实现中所有 `CriticalRateLimit()` 路由都共用同一个按 IP 计数的 Redis 键：

```text
rateLimit:v2:ip:CT:<client-ip>
```

当用户已达到活跃登录会话上限时，密码登录会返回 `409 AUTH_SESSION_LIMIT`；用户因 Classic 只显示通用 409 错误而连续重试后，这些失败请求仍会消耗共享 `CT` 桶。共享桶耗尽后，合法的 Refresh、登录、注册、OAuth、密码重置乃至其他关键操作都会在窗口剩余时间内返回 429，形成“菜单切换后像被退出、随后很久无法登录”的连锁故障。

#### 长期业务不变量

> 登录暴力破解保护必须保留，但失败登录不得污染合法 Refresh、Logout 或其他无关关键操作的限流额度；Refresh 的暂时性 429 不能清除 Classic 登录态，登录页必须显示可操作的会话上限和等待时间提示。

必须保留：

- `CriticalRateLimit()` 的空 scope 继续使用原 `CT` 桶，未迁移的上游路由保持兼容。
- 登录相关入口（密码、2FA、Passkey、微信、Telegram）共用 `CT:auth-login`，避免通过不同登录形式绕过同一登录保护。
- Refresh 独占 `CT:auth-refresh`，默认 `120 次 / 1200 秒`；可通过 `AUTH_REFRESH_RATE_LIMIT`、`AUTH_REFRESH_RATE_LIMIT_DURATION` 调整，并继续受 `CRITICAL_RATE_LIMIT_ENABLE` 控制。
- Logout、注册、OAuth、密码重置分别使用独立 scope，不能再因登录失败或 `/api/ratio_config` 等旧 Critical 路由耗尽而被连带封锁。
- Redis 和内存限流实现必须使用同样的 scope 语义；429 继续返回 `Retry-After`。
- 不能通过提高 `GLOBAL_API_RATE_LIMIT` 代替本隔离方案，因为 Global API 与 Critical 是不同的计数桶。
- Classic 的 Refresh 对网络失败、5xx、429 保持 `transient_error`，不得删除用户资料或强制跳转登录页。
- Classic 登录、2FA、Passkey、微信和 Telegram 登录错误由页面统一处理，避免 Axios 拦截器与组件重复弹 Toast。
- `AUTH_SESSION_LIMIT` 必须提示用户在已登录设备进入“登录会话”并退出其他会话；无可用已登录设备时提示通过重置密码撤销全部会话。
- `AUTH_SESSION_ISSUANCE_LIMIT` 必须说明近期创建会话过多，需要等待滚动窗口结束。
- 普通 429 优先读取 `Retry-After` 并显示剩余秒数；不得只显示 Axios 的状态码文本。

#### 当前实现路径

- `common/constants.go`、`common/init.go`
  - `AuthRefreshRateLimitNum`
  - `AuthRefreshRateLimitDuration`
  - `AUTH_REFRESH_RATE_LIMIT`
  - `AUTH_REFRESH_RATE_LIMIT_DURATION`
- `middleware/rate-limit.go`
  - `CriticalRateLimit()` 保留原 `CT` 行为
  - `ScopedCriticalRateLimit(scope)`
  - `AuthRefreshRateLimit()`
- `middleware/rate_limit_test.go`
  - 登录、Refresh、旧 `CT` 三类桶的隔离、阈值与 `Retry-After` 回归测试
- `router/api-router.go`
  - 认证入口的 scope 分配
- `web/classic/src/helpers/auth-error-message.js`
  - 认证错误码与 `Retry-After` 的用户提示映射
- `web/classic/src/components/auth/LoginForm.jsx`
- `web/classic/src/components/auth/TwoFAVerification.jsx`
- `web/classic/src/i18n/locales/{en,zh-CN,zh-TW,fr,ja,ru,vi}.json`

#### 上游同步保留策略

- 若上游重构限流中间件，优先迁移“业务 scope 隔离”而不是机械保留函数名；验收重点是 Redis/内存键空间和路由分组行为。
- 若上游新增登录方式，该入口必须加入 `auth-login` 共享桶；不能为每种登录方式创建互相独立、可绕过的暴力破解额度。
- 若上游调整 Refresh 协议或端点，新的 Refresh 入口仍须使用独立高容量桶，且不能退回通用 `CT`。
- 若上游为 429 增加标准 JSON 错误体，Classic 可优先显示上游消息，但必须继续兼容只有 `Retry-After`、无响应体的情况。
- 若上游完善 Classic 或统一前端错误映射，可复用上游实现，但必须逐项核对 `AUTH_SESSION_LIMIT`、`AUTH_SESSION_ISSUANCE_LIMIT`、429 等待秒数和避免重复 Toast 的行为完全等价后，才能删除本地 helper。

#### 可重复验收

- [ ] 同一 IP 连续请求登录直至 `auth-login` 返回 429 后，`POST /api/user/auth/refresh` 仍可在其独立额度内成功。
- [ ] 同一 IP 耗尽旧 `CT` 桶（例如未迁移的 Critical 路由）后，登录与 Refresh 独立桶仍不受影响。
- [ ] 2FA、Passkey、微信、Telegram 与密码登录共同消耗 `auth-login`，不能互相绕过登录保护。
- [ ] Refresh 默认允许 120 次 / 1200 秒，超限时返回 429 和正确 `Retry-After`；修改两个环境变量后阈值与窗口同步变化。
- [ ] 429 Refresh 不清除 Classic 用户状态；服务恢复或窗口结束后可以继续 Refresh。
- [ ] Classic 遇到 `AUTH_SESSION_LIMIT` 时显示撤销其他会话/重置密码的明确说明。
- [ ] Classic 遇到 `AUTH_SESSION_ISSUANCE_LIMIT` 时显示滚动窗口等待说明。
- [ ] Classic 遇到限流 429 时显示 `Retry-After` 剩余秒数，且同一错误只弹一次 Toast。
- [ ] `go test ./middleware ./router -count=1`、`go build ./...`、Classic 定向 Prettier 和 `bun run build` 通过。

### 4.14 Classic 操练场鉴权与钱包初始化请求约束

#### 背景与生产根因

Classic 操练场使用原生 `fetch` 和 `sse.js` 请求 `POST /pg/chat/completions`，没有经过统一 Axios 拦截器。该路由由 `middleware.UserAuth()` 保护，需要 Dashboard Access Token；旧实现只发送 `New-Api-User`，没有发送 `Authorization: Bearer ...`，因此登录后任意模型请求都会返回 `AUTH_UNAUTHORIZED`。同时，Classic 在 Refresh Cookie bootstrap 完成前就挂载 Console 子页面，页面组件会先并发发出一批无 Bearer 请求，再依赖 401 Refresh 重试，造成菜单切换阻塞和认证请求放大。

钱包页还有一个独立问题：读取 `/api/user/topup/info` 后会自动调用 `POST /api/user/amount` 计算最小充值金额。上游为避免 32 位 quota 溢出，在金额预览和支付路径保留了钱包容量校验；当当前余额已经接近上限时，仅打开钱包页面就会误触发 `top-up quota limit exceeded`。这不是 HTTP 429，也不能通过删除后端容量保护解决。

#### 长期业务不变量

> Classic `/pg/*` 操练场必须使用 Dashboard Access Token，不得读取或泄露用户 `sk-...` API Token；Console 受保护页面必须在认证 bootstrap 完成后再挂载；钱包页面初始化只能读取配置，不得自动触发金额预览、支付创建或钱包容量预校验。

必须保留：

- 操练场继续请求 `/pg/chat/completions`，由后端按当前登录用户和选择分组创建临时 Playground Token；不得为了绕过 Dashboard 鉴权改成 `/v1/chat/completions`。
- 原生非流式 `fetch` 和流式 `sse.js` 请求必须共用同一组请求头，同时携带 Dashboard `Authorization: Bearer <access token>` 和兼容所需的 `New-Api-User`。
- 操练场发起请求前必须确认 Access Token 仍有有效期；Token 缺失、已过期或临近过期时复用现有单飞 `refreshAuthentication()`，不能新增第二套并发 Refresh。
- Access Token 仍只保存在运行时内存，不得为了操练场写入 localStorage，也不得自动读取用户创建的 `sk-...` Token。
- 若无法取得有效 Dashboard Token，操练场应在本地结束加载状态并显示登录已过期，不发送必然失败的 `/pg/*` 请求。
- 初次打开或刷新 Console 且本地存在用户资料时，必须等待 Refresh Cookie bootstrap 完成后再挂载 Header、Sider 和受保护页面，避免先发出 `/api/user/self`、`/api/user/models`、`/api/user/self/groups` 等无 Bearer 请求。公共首页、登录页和无本地登录资料的跳转不应被该等待状态阻塞。
- Axios 请求拦截器可以为普通 Dashboard 请求补充运行时 Bearer，但不得覆盖调用方显式提供的 `Authorization`。
- 钱包初始化只读取 `/api/user/topup/info`、订阅和邀请等只读数据；不得自动调用 `/api/user/amount`、支付创建接口或其他会触发充值容量预校验的接口。
- 用户主动修改充值金额、选择支付方式或准备支付时，金额预览仍可按现有流程调用；真正支付创建和结算必须继续执行 `ValidateTopUpQuotaCapacity` 等后端安全检查。
- `top-up quota limit exceeded` 是钱包容量保护错误，不得误判为 HTTP/Critical 限流，也不得通过放宽 `common.MaxQuota`、删除 int32 饱和保护或跳过结算校验来消除。

#### 当前实现路径

- `web/classic/src/helpers/auth-session.js`
  - `getValidAccessToken()` 检查运行时 Token 有效期，并复用 Refresh 单飞恢复。
- `web/classic/src/hooks/playground/useApiRequest.jsx`
  - 非流式和 SSE 请求统一附加 Dashboard Bearer；无有效认证时本地终止并展示认证错误。
- `web/classic/src/components/layout/PageLayout.jsx`
  - 有缓存用户资料时，在 bootstrap 完成前用 Loading 阻止 Console 子树挂载。
- `web/classic/src/helpers/api.js`
  - 仅在调用方没有显式 Authorization 时补充 Dashboard Bearer。
- `web/classic/src/components/topup/index.jsx`
  - 读取充值配置后只初始化金额状态，不再自动请求 `/api/user/amount`。
- 后端容量保护继续位于 `model/topup.go`、`controller/topup.go` 及对应回归测试中，本次二开不修改其安全语义。

#### 上游同步保留策略

- 上游若重构 `/pg/*`、Dashboard Token 或 Refresh 协议，优先迁移“操练场使用当前 Dashboard 身份、后端生成临时 Playground Token”的业务语义；不能简单保留旧 fetch 代码，也不能改为自动选择用户 API Key。
- 上游若统一原生请求与 Axios 客户端，可删除局部 header 拼装，但必须确认流式与非流式都能在 Token 过期前完成单飞刷新，且不会把 Dashboard Bearer 错发到 `/v1/*` 用户 API。
- 上游若改变 Console 布局或路由结构，认证 readiness 门禁必须覆盖所有会在挂载时请求受保护接口的 Header、Sider 和页面组件。
- 上游若调整充值预览接口，钱包初次打开仍只能执行只读初始化；容量校验应保留在用户主动预览、支付创建和结算链路。
- 合并冲突时不得用“删除后端 quota 上限校验”解决页面初始化误报；应移除或延后前端无意触发的写入/预校验请求。

#### 可重复验收

- [ ] 登录 Classic 后进入操练场，非流式请求 `POST /pg/chat/completions` 携带 Dashboard Bearer 和 `New-Api-User`，返回正常模型响应。
- [ ] 流式请求使用同样的认证头，SSE 能持续接收消息并以 `[DONE]` 正常结束。
- [ ] Access Token 临近过期时，操练场先执行一次单飞 Refresh，再发送模型请求；多个并发请求不会制造 Refresh 风暴。
- [ ] Refresh Cookie 失效时，操练场不请求 `/pg/chat/completions`，消息区域明确显示需要重新登录。
- [ ] 硬刷新 `/console/playground`、`/console/token` 和 `/console/topup` 时，认证 bootstrap 完成前不会先出现一批受保护接口 401。
- [ ] 仅打开钱包页面不会发送 `POST /api/user/amount`，也不会显示 `top-up quota limit exceeded`。
- [ ] 用户主动选择充值金额或支付方式时仍能获取实付金额；余额接近上限时，支付预览/创建仍由后端容量保护拒绝。
- [ ] Classic 修改文件定向 Prettier、`bun run build` 与 `git diff --check` 通过。

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

### 认证与限流

- [ ] 登录、2FA、Passkey、微信和 Telegram 登录共同使用 `auth-login` 桶。
- [ ] 登录桶耗尽不会阻止合法 Refresh，旧 `CT` 桶耗尽也不会阻止登录或 Refresh。
- [ ] Refresh 使用独立默认 `120 次 / 1200 秒`，429 带正确 `Retry-After`。
- [ ] Refresh 的网络错误、5xx、429 不清除 Classic 登录态。
- [ ] `AUTH_SESSION_LIMIT`、`AUTH_SESSION_ISSUANCE_LIMIT` 和普通 429 在 Classic 中显示可操作提示且不重复弹 Toast。
- [ ] Classic Console 在 Refresh Cookie bootstrap 完成前不挂载受保护页面，不产生批量无 Bearer 的 401。
- [ ] Classic 操练场流式和非流式 `/pg/chat/completions` 都携带有效 Dashboard Bearer，不读取用户 `sk-...` Token。

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
- [ ] 仅打开 Classic 钱包不自动调用 `/api/user/amount`，用户主动预览或支付时仍保留钱包容量保护。

### 异步任务

- [ ] 超过 1000 条未完成任务时，不会永远只处理第一批。
- [ ] 同一渠道内任务不是逐条全局串行请求。
- [ ] 不同渠道可并发轮询。
- [ ] 每个并发任务使用独立 adaptor，没有共享状态竞态。
- [ ] 没有 upstream ID 的任务会失败收敛。
- [ ] 超时清理、CAS 更新和结算防重逻辑正常。
- [ ] context 取消后轮询可以正常退出。

### 异步视频计费

- [ ] 显式 `per_second` 模型即使仍在 `TASK_PRICE_PATCH` 中也按秒应用任务倍率。
- [ ] 显式 `per_request` 模型即使不在 `TASK_PRICE_PATCH` 中也按次计费。
- [ ] 未显式设置的旧模型仍保持白名单内按次、白名单外按秒。
- [ ] 系统设置保存并重新打开后，按次/按秒模式回显正确。
- [ ] 模型广场的卡片、表格、Badge、筛选数量和价格单位均区分按次与按秒；Classic 按秒标签为亮橙色、按次标签为青绿色。
- [ ] `/api/pricing` 返回的 `billing_mode` 与 `task_billing_unit` 和实际任务扣费一致。

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
- 本轮先在中间分支完成检查，随后已按用户确认合回 `hub`；当前 `hub` merge commit 为 `74a6dec3c`，未在本次 Classic 认证修复中执行 push。

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
- 根模块 `go build ./...`：通过。
- 新 UI `bun run build`：通过。
- OpenAI SSE 定向回归测试：通过。
- 任务轮询同渠道/跨渠道并发定向测试：通过。
- `go test ./model ./router ./service ./relay/channel/openai`：通过。
- `go test ./controller -count=1`：通过。
- `go build ./...`：通过。
- `cd relaykit; GOWORK=off go build ./...`：通过。
- 完整 `go test ./...`：通过。首次执行发现上游遗留的两项测试仍断言 Classic 已移除；将其改为保护 Classic 可选契约后重新执行，全量通过。
