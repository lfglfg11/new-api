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
