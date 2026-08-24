# 开发日志

## 2026-01-31
- **鉴权兼容性更新**：在 `middleware/auth.go` 中增加对 One-Hub 迁移 Key (59位) 的兼容支持。当系统检测到 Key 长度大于48 位时，自动截取前 48 位进行数据库验证，实现了无感迁移。

## 2026-02-01
- **支付能力扩展**：新增支付宝当面付与微信支付（Native）配置支持，并在后端支付流程中按配置优先切换到直连网关（保持易支付兼容）。
- **支付回调与二维码**：新增支付宝/微信回调处理与二维码渲染接口，前端支持二维码与跳转型支付响应。
- **配置入口补全**：支付设置页新增支付宝/微信 JSON 配置项，支持最小化增量更新。
- **配置体验与回显**：支付设置页改为分字段输入并回显配置，同时二维码接口改为公开地址以避免新窗口鉴权失败。
- **支付交互优化**：二维码支付改为页面弹窗展示，避免浏览器拦截新标签页。
- **移动端支付宝体验**：当面付二维码支持“打开支付宝”按钮，移动端优先尝试直接唤起应用。
- **支付回调兼容**：新增 /notify 兼容路由，支持未配置支付宝网关时的默认回调路径。

## 2026-02-02
- **迁移鉴权兼容**：完善 token 解析逻辑，兼容 done-hub 旧分隔符并避免普通 key 被误判为指定渠道。

## 2026-03-20
- **上游重置后冲突合并**：完成 `hub-merge-upstream` 合并 `main` 过程中的 31 个 add/add 冲突清理，已进入可提交状态（`All conflicts fixed but you are still merging`）。
- **支付主链路保留策略**：`controller/topup.go`、`router/api-router.go`、`model/option.go`、`web/src/components/topup/*`、`web/src/pages/Setting/Payment/SettingsPaymentGateway.jsx` 以本地实现为基线，确保支付宝当面付、微信支付与二维码流程不回退。
- **上游能力吸收策略**：公共能力与中立增强（如 `relay/common/override*.go`、`middleware/*`、`service/log_info_generate.go`、多语言与前端日志增强）采用上游版本，降低后续再同步成本。
- **流式误扣费修复校验**：已核对 OpenAI 流式错误检测链路仍存在（`GetOpenAIError` 相关逻辑可检索到），避免“请求过程报错却被判成功”导致结算误扣费回归。
- **验证状态**：受网络访问 `proxy.golang.org` 超时影响，`go mod tidy` / `go test ./...` 未能完成，需在可联网环境下补跑。
- **OneHub 迁移 token 兼容恢复**：在 `model/token.go` 的 `ValidateUserToken` 中恢复 59 位 key 截取前 48 位后查库逻辑，避免迁移库 token 校验失败。

## 2026-03-21
- **Hub 构建失败排查**：确认 hub 与 hub0 在支付宝/微信/二维码核心实现文件一致，功能未回退。
- **CI 依赖校验修复**：补齐 `go.sum` 中 `skip2/go-qrcode`、`smartwalle/alipay/v3`、`wechatpay-apiv3/wechatpay-go` 的缺失校验条目，修复 Docker 构建阶段缺失 go.sum entry 的失败风险。
- **main/hub0 对照修复**：定位到 `hub` 分支包含 `controller/topup_waffo.go`，但 `go.mod` 未声明 `github.com/waffo-com/waffo-go`；已补齐 direct require。
- **Alipay 间接依赖修复**：补齐 `go.sum` 中 `smartwalle/ncrypto`、`smartwalle/ngx`、`smartwalle/nsign` 校验条目，消除 CI 中 `missing go.sum entry` 类报错。

## 2026-03-23
- **OneHub 令牌兼容回滚**：恢复 `middleware/auth.go` 中 `splitTokenKeyParts` 解析逻辑，避免普通老令牌被 `-` 误切分为“指定渠道”参数导致 `普通用户不支持指定渠道` 误报。
- **修复验证**：执行 `go test ./middleware/...` 编译通过。
- **无效令牌兼容补齐**：`TokenAuthReadOnly` 改为复用 `splitTokenKeyParts` 并执行 48 位截断，避免迁移令牌在只读鉴权路径被误判为无效。
- **hub0 对齐**：`model/token.go` 的 `ValidateUserToken` 截断逻辑恢复为 `len(key) > 48` 后 `key[:48]` 的原始写法。

## 2026-08-24
- **上游同步基线**：在中间分支 `hub-merge-upstream` 先保留 `hub@9d3be0d9a`，再合并 `main/upstream-main@2d8e50bf3`；本轮只提交中间分支，未合回 `hub`、未推送远端。
- **本地文件清理**：删除未跟踪的本机虚拟主机文件 `.codex-newapi-vhost.conf`，避免误纳入版本库。
- **Classic / 老 UI 长期保留**：拒绝上游删除 Classic UI 的行为，完整保留 `web/classic/`、Classic 支付与渠道状态操作、多语言资源、`main.go` 双 embed、`router/web-router.go` theme 路由以及 `Dockerfile` 双前端构建链路。
- **Classic workspace 修复**：上游已删除旧 `web/default/package.json`，因此把 `web/package.workspace.json` 从 `default + classic` 改为仅声明 `classic`，并重新生成 `web/bun.lock.workspace`；`bun install --filter ./classic --frozen-lockfile` 验证无锁文件漂移。
- **核心冲突决策**：`main.go` 同时吸收上游 relaykit 日志和 trusted proxies 初始化；`model/channel.go` 采用上游加锁与字段白名单状态持久化并保留缓存 miss 落库；`relay/channel/openai/relay-openai.go` 适配上游流扫描 API 后继续阻止 SSE 错误进入成功 usage/结算；`service/task_polling.go` 保留上游 CAS/退款语义并恢复二开批量遍历和并行轮询。
- **异步任务并行修复**：恢复跨渠道并行和同渠道逐任务并行；每个任务通过 adaptor factory 获取独立 adaptor，并使用独立 `RelayInfo`，同时等待已启动任务结束并尊重 context 取消。相关路径：`service/task_polling.go`、`service/task_polling_test.go`。
- **Classic 契约测试对齐**：将上游“Classic 已移除”的断言改为二开真实契约，验证 `theme.frontend=classic` 可保存，且 `/api/status` 会发布选中的 Classic theme。相关路径：`controller/theme_compat_test.go`。
- **二开文档强制规则**：新增 `docs/CUSTOMIZATIONS.md`，并在根目录 `AGENTS.md` 规定：今后 `hub`、`hub0`、`hub-merge-upstream` 的任何二开代码、配置、前端、工作流、兼容或冲突决策，都必须在同一批变更中同步更新 `log.md` 与 `docs/CUSTOMIZATIONS.md`；纯上游 `main` 不写二开记录。
- **验证结果**：`go test ./model ./router ./service ./relay/channel/openai`、`go test ./controller -count=1`、`go build ./...`、`cd relaykit; GOWORK=off go build ./...` 均通过；OpenAI SSE、任务并行定向回归测试通过；新 UI `bun run build` 与 Classic UI `bun run build` 均通过。完整 `go test ./...` 最终通过。

- **`/v1/videos` 按秒/按次计费配置**：固定价异步视频模型新增显式 `per_second` 与 `per_request` 模式；系统设置中的显式选择优先于 `TASK_PRICE_PATCH`，按秒模型不再需要加入环境变量白名单，显式按次模型也不会误乘视频秒数。
- **`TASK_PRICE_PATCH` 向后兼容**：未显式配置计费单位时继续沿用旧逻辑——白名单内视频模型按次，白名单外视频模型按请求中的生成秒数应用 `OtherRatios`；非视频固定价模型默认按次，兼容上游和既有部署。
- **计费链路统一**：任务提交预扣、适配器提交后倍率调整、任务消费日志统一使用 `billing_setting.ShouldApplyTaskBillingRatios` 判定，避免系统设置、环境变量和实际扣费口径不一致。
- **模型广场与系统设置展示**：`/api/pricing` 新增 `task_billing_unit`，模型卡片、表格、Badge、筛选器分别显示 `/次`、`/秒` 和“按次/按秒”；模型定价可视化编辑器新增“按秒计费”标签页并持久化到 `billing_setting.billing_mode`，上游价格同步也可导入 `per_request` / `per_second`。
- **按秒计费验证**：`go test ./setting/billing_setting ./model -count=1`、`go test ./controller ./relay -count=1`、service 任务计费定向测试、相关前端 Vitest、定向 Oxlint、`bun run i18n:sync`、新 UI `bun run build`、`go build ./...` 均通过；完整 `go test ./service -count=1` 仍会触发与本次无关的既有缓存测试 `TestObserveChannelAffinityUsageCacheByRelayFormat_UnsupportedModeKeepsEmpty`（整包运行期望 1、实际 3），该测试单独运行通过。
- **Classic 登录后白屏根因与修复**：生产日志显示密码登录和 `/console` 页面均返回 200，但随后 `/api/user/self` 返回 401。根因是上游认证基线 `31d70fca3` 已将 Dashboard 从旧 Session 协议迁移为 Auth Bundle + 内存 Access Token + HttpOnly Refresh Cookie + Bearer 请求头，而保留的 Classic UI 仍把整个登录响应当作用户资料写入本地且不发送 Bearer，导致登录后立即失去鉴权。
- **Classic 无状态认证适配**：新增 `web/classic/src/helpers/auth-session.js`，Access Token 仅保存在页面运行时内存，用户资料继续保存在 `localStorage.user`；页面启动时用 Refresh Cookie bootstrap，会话内请求动态附加 Bearer 与 `New-API-User`，401 时单飞刷新并仅重试一次原请求。Refresh 兼容 `AUTH_REFRESH_RACE` 延迟重试和 `AUTH_SESSION_MISMATCH` 清除旧 SID 后单次恢复；只有确认匿名或会话失步时才清理登录态并跳转 `/login?expired=true`，5xx、429 和网络错误不误清理用户。
- **Classic 登录协议补齐**：密码、微信、Telegram、OAuth、2FA、Passkey 登录统一解析 Auth Bundle；2FA 提交 `flow_token`，Passkey finish 提交 `flow_token + credential`；OAuth state 改为 `POST /api/oauth/state` 并携带 `provider + intent + aff`；注销改为 `POST /api/user/auth/logout`。关键路径包括 `web/classic/src/helpers/api.js`、`web/classic/src/helpers/auth.jsx`、`web/classic/src/components/auth/*`、`web/classic/src/components/layout/PageLayout.jsx`、`web/classic/src/hooks/common/useHeaderBar.js`、`web/classic/src/components/settings/PersonalSetting.jsx`。
- **Classic 认证保留规则**：后续同步上游时，不能只保留 Classic UI 外观和构建目录；必须同步核对上游 Dashboard 认证协议并保留 Auth Bundle、内存 Access Token、HttpOnly Refresh Cookie bootstrap、Bearer、401 单次刷新重试、Refresh race/session mismatch、2FA/Passkey flow token、OAuth state POST 和新注销端点。
- **Classic 认证验证**：Classic `bun run build`、根模块 `go build ./...` 均通过；本次修改文件的定向 `prettier --check` 通过。全目录 `bun run lint` 会命中项目既有未格式化文件及并行构建时的 `dist` 临时文件，`bun run eslint` 因现有 ESLint/AJV 依赖错误（`defaultMeta` / `missingRefs`）无法执行，不能视为本次代码语法失败；仍需发布新 `ghcr.io/lfglfg11/new-api:hub` 镜像后完成真实登录、刷新、Token 过期、2FA、Passkey、OAuth 与注销验收。

- **Classic 按秒计费入口漏项修复**：用户实际使用的是长期保留的 Classic / 老 UI；此前按秒计费只实现于 default 新 UI，导致 Classic“模型定价设置 → 可视化编辑”仍只有按量、按次、表达式/阶梯三个选项。本次为 Classic 补齐“按秒计费”模式、`$/秒` 固定价格输入、保存预览以及 `billing_setting.billing_mode=per_second` / `per_request` 的保存与回显。
- **Classic 模型广场按秒展示补齐**：Classic 模型卡片、价格表格、详情弹窗和计费类型筛选统一识别显式 `billing_mode` 与后端发布的 `task_billing_unit`，按秒模型显示“按秒计费”和 `/秒`，按次模型继续显示“按次计费”和 `/次`；两个类型独立筛选并独立统计数量。关键路径包括 `web/classic/src/pages/Setting/Ratio/`、`web/classic/src/helpers/utils.jsx`、`web/classic/src/components/table/model-pricing/`、`web/classic/src/hooks/model-pricing/` 及 Classic 多语言文件。
- **Classic 按秒计费保留规则**：后续同步上游时，default 与 Classic 两套 UI 都必须保留按量、按次、按秒、表达式/阶梯四种模式；不得只保留新 UI 实现，也不得遗漏 Classic 模型广场的 Badge、价格单位、筛选和数量统计。
- **Classic 按秒标签视觉区分**：模型广场卡片、表格和详情价格表中的“按秒计费”统一改用醒目的亮橙色标签，按次计费继续使用青绿色，避免 `cyan` / `teal` 在浅色主题下视觉过于接近；关键路径为 `web/classic/src/components/table/model-pricing/`；验证：`web/classic` 下 `bun run build` 通过，`git diff --check` 通过。
- **Classic 模型广场管理员快捷配置**：管理员（`role >= 10`）在每张模型卡片右上角可看到编辑按钮，点击后直接复用模型管理的“创建新的模型”侧滑表单，并把当前卡片的 `model_name` 精确预填到模型名称字段；普通用户和未登录访问者不渲染该按钮，创建请求继续由现有 `/api/models/` 管理员中间件保护。实现仅涉及 `web/classic/src/components/table/model-pricing/layout/PricingPage.jsx` 与 `web/classic/src/components/table/model-pricing/view/card/PricingCardView.jsx`，不新增后端接口，以降低上游同步冲突；验证：相关 JSX 定向 Prettier 检查、`web/classic` 下 `bun run build` 与 `git diff --check` 均通过；定向 ESLint 仍被项目现有 ESLint/AJV 初始化错误 `defaultMeta` / `missingRefs` 阻断。
- **Classic 按秒计费验证**：`web/classic` 下 `bun run build` 通过，构建产物已包含“按秒计费”、`per-second` 与 `per_second`；`git diff --check` 通过。`bun run i18n:sync` 因当前 workspace 缺少 `@inquirer/password/dist/index.js` 无法启动，ESLint 因现有 AJV 依赖错误 `defaultMeta` 无法启动，均不是本次 JSX 构建失败。相关修改已提交并推送至 `hub` 分支；生产环境仍需使用包含对应提交的新镜像后生效。

- **认证关键限流隔离，修复登录/刷新互相封锁**：生产排查确认 `GLOBAL_API_RATE_LIMIT` 并未耗尽，真正命中的是默认 `20 次 / 1200 秒` 的 Critical IP 限流；密码登录连续返回 `409 AUTH_SESSION_LIMIT` 后，登录、Refresh、注册、OAuth、价格配置等原本共用 `rateLimit:v2:ip:CT:<IP>`，最终使合法 `POST /api/user/auth/refresh` 与再次登录同时返回 429。新增 `ScopedCriticalRateLimit`，把登录（含 2FA/Passkey/微信/Telegram）、Refresh、Logout、注册、OAuth、密码重置拆成独立桶；旧 `CriticalRateLimit()` 继续使用 `CT`，保证未迁移的上游关键路由行为兼容。Refresh 使用独立默认 `120 次 / 1200 秒`，可通过 `AUTH_REFRESH_RATE_LIMIT`、`AUTH_REFRESH_RATE_LIMIT_DURATION` 调整，仍受 `CRITICAL_RATE_LIMIT_ENABLE` 总开关控制。
- **Classic 登录错误提示修复**：Classic 登录类请求关闭 Axios 全局重复错误 Toast，统一解析 `AUTH_SESSION_LIMIT`、`AUTH_SESSION_ISSUANCE_LIMIT` 与 429 `Retry-After`；会话达到上限时明确提示到已登录设备的“登录会话”撤销其他会话，429 时显示剩余等待秒数，不再只显示 `Request failed with status code 409` 或笼统“登录失败”。关键路径为 `middleware/rate-limit.go`、`router/api-router.go`、`web/classic/src/helpers/auth-error-message.js`、`web/classic/src/components/auth/LoginForm.jsx`、`web/classic/src/components/auth/TwoFAVerification.jsx` 及 Classic 多语言文件。
- **认证限流验证**：新增 Miniredis 回归测试，确认同一 IP 耗尽登录桶不会占用 Refresh 桶，Refresh 独立阈值和 `Retry-After` 生效，且旧 `CriticalRateLimit()` 仍写入原 `CT` 桶；`go test ./middleware ./router -count=1`、`go build ./...`、Classic 登录错误 helper 定向校验、相关 JS/JSX Prettier 检查、Classic `bun run build` 与 `git diff --check` 通过。`bun run i18n:sync` 仍被 workspace 现有缺失模块 `@inquirer/password/dist/index.js` 阻断；本次新增 5 个认证提示键已通过脚本写入全部 7 个 Classic 活跃语言文件。
