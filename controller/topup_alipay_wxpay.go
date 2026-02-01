package controller

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/smartwalle/alipay/v3"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/downloader"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

const (
	alipayPayTypeFacePay = "facepay"
	alipayPayTypePagePay = "pagepay"
	alipayPayTypeWapPay  = "wappay"
)

type alipayConfig struct {
	AppID      string `json:"app_id"`
	PrivateKey string `json:"private_key"`
	PublicKey  string `json:"public_key"`
	PayType    string `json:"pay_type"`
}

type wxpayConfig struct {
	AppID                      string `json:"app_id"`
	MchID                      string `json:"mch_id"`
	MchCertificateSerialNumber string `json:"mch_certificate_serial_number"`
	MchAPIv3Key                string `json:"mch_apiv3_key"`
	MchPrivateKey              string `json:"mch_private_key"`
	PayType                    string `json:"pay_type"`
}

type payResponse struct {
	PayType string
	PayLink string
	QRText  string
}

var (
	wxpayClient           *core.Client
	wxpayClientLock       sync.Mutex
	wxpayClientFingerprint string
)

func isAlipayEnabled() bool {
	cfg, err := getAlipayConfig()
	if err != nil {
		return false
	}
	return cfg.AppID != "" && cfg.PrivateKey != "" && cfg.PublicKey != ""
}

func isWxpayEnabled() bool {
	cfg, err := getWxpayConfig()
	if err != nil {
		return false
	}
	return cfg.AppID != "" && cfg.MchID != "" && cfg.MchCertificateSerialNumber != "" && cfg.MchAPIv3Key != "" && cfg.MchPrivateKey != ""
}

func getAlipayConfig() (*alipayConfig, error) {
	if strings.TrimSpace(setting.AlipayConfig) == "" {
		return nil, errors.New("alipay config is empty")
	}
	var cfg alipayConfig
	if err := common.UnmarshalJsonStr(setting.AlipayConfig, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func getWxpayConfig() (*wxpayConfig, error) {
	if strings.TrimSpace(setting.WxpayConfig) == "" {
		return nil, errors.New("wxpay config is empty")
	}
	var cfg wxpayConfig
	if err := common.UnmarshalJsonStr(setting.WxpayConfig, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func getWxpayClient(cfg *wxpayConfig) (*core.Client, error) {
	fingerprint := fmt.Sprintf("%s|%s|%s|%s|%s", cfg.AppID, cfg.MchID, cfg.MchCertificateSerialNumber, cfg.MchAPIv3Key, cfg.MchPrivateKey)
	wxpayClientLock.Lock()
	defer wxpayClientLock.Unlock()
	if wxpayClient != nil && wxpayClientFingerprint == fingerprint {
		return wxpayClient, nil
	}
	mchPrivateKey, err := utils.LoadPrivateKey(cfg.MchPrivateKey)
	if err != nil {
		return nil, err
	}
	ctx := context.Background()
	opts := []core.ClientOption{
		option.WithWechatPayAutoAuthCipher(cfg.MchID, cfg.MchCertificateSerialNumber, mchPrivateKey, cfg.MchAPIv3Key),
	}
	client, err := core.NewClient(ctx, opts...)
	if err != nil {
		return nil, err
	}
	wxpayClient = client
	wxpayClientFingerprint = fingerprint
	return wxpayClient, nil
}

func getPayTradeNo(userId int) string {
	tradeNo := fmt.Sprintf("%s%d", common.GetRandomString(6), time.Now().Unix())
	return fmt.Sprintf("USR%dNO%s", userId, tradeNo)
}

func buildNotifyURL(path string) string {
	callbackAddress := strings.TrimSuffix(service.GetCallbackAddress(), "/")
	return callbackAddress + path
}

func requestAlipay(c *gin.Context, req *EpayRequest) {
	cfg, err := getAlipayConfig()
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "支付宝配置无效"})
		return
	}

	if req.Amount < getMinTopup() {
		c.JSON(200, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup())})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(200, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	tradeNo := getPayTradeNo(id)
	notifyURL := buildNotifyURL("/api/user/alipay/notify")
	returnURL := strings.TrimSuffix(system_setting.ServerAddress, "/") + "/console/log"

	payResp, err := createAlipayPay(cfg, tradeNo, payMoney, notifyURL, returnURL)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(int64(amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}
	if amount <= 0 {
		c.JSON(200, gin.H{"message": "error", "data": "充值数量无效"})
		return
	}

	topUp := &model.TopUp{
		UserId:        id,
		Amount:        amount,
		Money:         payMoney,
		TradeNo:       tradeNo,
		PaymentMethod: "alipay",
		CreateTime:    time.Now().Unix(),
		Status:        common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	respData := gin.H{"pay_type": payResp.PayType}
	if payResp.PayLink != "" {
		respData["pay_link"] = payResp.PayLink
	}
	if payResp.QRText != "" {
		respData["qr_text"] = payResp.QRText
	}
	c.JSON(200, gin.H{"message": "success", "data": respData})
}

func createAlipayPay(cfg *alipayConfig, tradeNo string, payMoney float64, notifyURL string, returnURL string) (*payResponse, error) {
	client, err := alipay.New(cfg.AppID, cfg.PrivateKey, true)
	if err != nil {
		return nil, err
	}
	if err := client.LoadAliPayPublicKey(cfg.PublicKey); err != nil {
		return nil, err
	}
	payType := strings.ToLower(strings.TrimSpace(cfg.PayType))
	if payType == "" {
		payType = alipayPayTypeFacePay
	}

	subject := fmt.Sprintf("%s-Token充值: %.2f", common.SystemName, payMoney)
	amount := strconv.FormatFloat(payMoney, 'f', 2, 64)
	ctx := context.Background()

	switch payType {
	case alipayPayTypePagePay:
		p := alipay.TradePagePay{}
		p.OutTradeNo = tradeNo
		p.TotalAmount = amount
		p.Subject = subject
		p.NotifyURL = notifyURL
		p.ReturnURL = returnURL
		p.ProductCode = "FAST_INSTANT_TRADE_PAY"
		p.TimeoutExpress = "15m"
		alipayRes, err := client.TradePagePay(p)
		if err != nil {
			return nil, err
		}
		payURL, params, err := extractAlipayURLAndParams(alipayRes.String())
		if err != nil {
			return nil, err
		}
		fullURL := buildURLWithParams(payURL, params)
		return &payResponse{PayType: "redirect", PayLink: fullURL}, nil
	case alipayPayTypeWapPay:
		p := alipay.TradeWapPay{}
		p.OutTradeNo = tradeNo
		p.TotalAmount = amount
		p.Subject = subject
		p.NotifyURL = notifyURL
		p.ReturnURL = returnURL
		p.ProductCode = "QUICK_WAP_WAY"
		p.TimeoutExpress = "15m"
		alipayRes, err := client.TradeWapPay(p)
		if err != nil {
			return nil, err
		}
		payURL, params, err := extractAlipayURLAndParams(alipayRes.String())
		if err != nil {
			return nil, err
		}
		fullURL := buildURLWithParams(payURL, params)
		return &payResponse{PayType: "redirect", PayLink: fullURL}, nil
	default:
		p := alipay.TradePreCreate{}
		p.OutTradeNo = tradeNo
		p.TotalAmount = amount
		p.Subject = subject
		p.NotifyURL = notifyURL
		p.ReturnURL = returnURL
		p.TimeoutExpress = "15m"
		alipayRes, err := client.TradePreCreate(ctx, p)
		if err != nil {
			return nil, err
		}
		if !alipayRes.IsSuccess() || alipayRes.Code != "10000" {
			return nil, fmt.Errorf("alipay trade precreate failed: %s", alipayRes.Msg)
		}
		return &payResponse{PayType: "qrcode", QRText: alipayRes.QRCode}, nil
	}
}

func extractAlipayURLAndParams(rawURL string) (string, map[string]string, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", nil, err
	}
	baseURL := fmt.Sprintf("%s://%s%s", parsedURL.Scheme, parsedURL.Host, parsedURL.Path)
	params := parsedURL.Query()
	paramMap := make(map[string]string)
	for key, values := range params {
		if len(values) > 0 {
			paramMap[key] = values[0]
		}
	}
	return baseURL, paramMap, nil
}

func buildURLWithParams(baseURL string, params map[string]string) string {
	if len(params) == 0 {
		return baseURL
	}
	query := url.Values{}
	for k, v := range params {
		query.Set(k, v)
	}
	return baseURL + "?" + query.Encode()
}

func requestWxpay(c *gin.Context, req *EpayRequest) {
	cfg, err := getWxpayConfig()
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "微信支付配置无效"})
		return
	}

	if req.Amount < getMinTopup() {
		c.JSON(200, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup())})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(200, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	tradeNo := getPayTradeNo(id)
	notifyURL := buildNotifyURL("/api/user/wxpay/notify")

	codeURL, err := createWxpayPay(cfg, tradeNo, payMoney, notifyURL)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(int64(amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}
	if amount <= 0 {
		c.JSON(200, gin.H{"message": "error", "data": "充值数量无效"})
		return
	}

	topUp := &model.TopUp{
		UserId:        id,
		Amount:        amount,
		Money:         payMoney,
		TradeNo:       tradeNo,
		PaymentMethod: "wxpay",
		CreateTime:    time.Now().Unix(),
		Status:        common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	c.JSON(200, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_type": "qrcode",
			"qr_text":  codeURL,
		},
	})
}

func createWxpayPay(cfg *wxpayConfig, tradeNo string, payMoney float64, notifyURL string) (string, error) {
	client, err := getWxpayClient(cfg)
	if err != nil {
		return "", err
	}
	amountTotal := int64(math.Round(payMoney * 100))
	if amountTotal <= 0 {
		return "", errors.New("invalid amount")
	}
	req := native.PrepayRequest{
		Appid:       core.String(cfg.AppID),
		Mchid:       core.String(cfg.MchID),
		Description: core.String(fmt.Sprintf("%s-Token充值", common.SystemName)),
		OutTradeNo:  core.String(tradeNo),
		NotifyUrl:   core.String(notifyURL),
		Amount: &native.Amount{
			Total: core.Int64(amountTotal),
		},
	}
	service := native.NativeApiService{Client: client}
	resp, result, err := service.Prepay(context.Background(), req)
	if err != nil {
		return "", err
	}
	if result.Response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("wechat native pay failed: %s", result.Response.Status)
	}
	if resp.CodeUrl == nil || *resp.CodeUrl == "" {
		return "", errors.New("wechat native pay missing code_url")
	}
	return *resp.CodeUrl, nil
}

func AlipayNotify(c *gin.Context) {
	cfg, err := getAlipayConfig()
	if err != nil {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}

	client, err := alipay.New(cfg.AppID, cfg.PrivateKey, true)
	if err != nil {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}
	if err := client.LoadAliPayPublicKey(cfg.PublicKey); err != nil {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}

	params := c.Request.URL.Query()
	if err := c.Request.ParseForm(); err != nil {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}
	for k, v := range c.Request.PostForm {
		params[k] = v
	}
	if err := client.VerifySign(params); err != nil {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}
	noti, err := client.DecodeNotification(params)
	if err != nil {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}
	if noti.TradeStatus != alipay.TradeStatusSuccess {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}

	tradeNo := noti.OutTradeNo
	if tradeNo == "" {
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)
	if err := completeTopup(tradeNo, "支付宝"); err != nil {
		log.Println("支付宝回调处理失败:", err.Error())
		_, _ = c.Writer.Write([]byte("failure"))
		return
	}
	alipay.ACKNotification(c.Writer)
}

type wxpayNotifyResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func WxpayNotify(c *gin.Context) {
	cfg, err := getWxpayConfig()
	if err != nil {
		c.JSON(http.StatusBadRequest, wxpayNotifyResponse{Code: "FAIL", Message: err.Error()})
		return
	}
	certificateVisitor := downloader.MgrInstance().GetCertificateVisitor(cfg.MchID)
	handler := notify.NewNotifyHandler(cfg.MchAPIv3Key, verifiers.NewSHA256WithRSAVerifier(certificateVisitor))
	transaction := new(payments.Transaction)
	notifyReq, err := handler.ParseNotifyRequest(context.Background(), c.Request, transaction)
	if err != nil {
		c.JSON(http.StatusBadRequest, wxpayNotifyResponse{Code: "FAIL", Message: err.Error()})
		return
	}
	if notifyReq.EventType != "TRANSACTION.SUCCESS" {
		c.Status(http.StatusNoContent)
		return
	}
	if transaction.TradeState == nil || *transaction.TradeState != "SUCCESS" {
		c.Status(http.StatusNoContent)
		return
	}

	tradeNo := ""
	if transaction.OutTradeNo != nil {
		tradeNo = *transaction.OutTradeNo
	}
	if tradeNo == "" {
		c.Status(http.StatusNoContent)
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)
	if err := completeTopup(tradeNo, "微信支付"); err != nil {
		log.Println("微信支付回调处理失败:", err.Error())
		c.Status(http.StatusNoContent)
		return
	}
	c.Status(http.StatusNoContent)
}

func completeTopup(tradeNo string, payName string) error {
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return errors.New("充值订单不存在")
	}
	if topUp.Status != common.TopUpStatusPending {
		return nil
	}

	topUp.Status = common.TopUpStatusSuccess
	topUp.CompleteTime = common.GetTimestamp()
	if err := topUp.Update(); err != nil {
		return err
	}

	dAmount := decimal.NewFromInt(int64(topUp.Amount))
	dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())
	if quotaToAdd <= 0 {
		return errors.New("充值额度无效")
	}

	if err := model.IncreaseUserQuota(topUp.UserId, quotaToAdd, true); err != nil {
		return err
	}

	model.RecordLog(topUp.UserId, model.LogTypeTopup, fmt.Sprintf("使用%s充值成功，充值金额: %v，支付金额：%f", payName, logger.LogQuota(quotaToAdd), topUp.Money))
	return nil
}
