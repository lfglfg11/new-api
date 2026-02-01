package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

const (
	defaultQRCodeSize = 256
	maxQRCodeTextLen  = 2048
)

func GetPayQRCode(c *gin.Context) {
	text := strings.TrimSpace(c.Query("text"))
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "参数错误"})
		return
	}
	if len(text) > maxQRCodeTextLen {
		c.JSON(http.StatusBadRequest, gin.H{"message": "二维码内容过长"})
		return
	}

	size := defaultQRCodeSize
	if sizeParam := strings.TrimSpace(c.Query("size")); sizeParam != "" {
		if v, err := strconv.Atoi(sizeParam); err == nil && v >= 128 && v <= 512 {
			size = v
		}
	}

	png, err := qrcode.Encode(text, qrcode.Medium, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "生成二维码失败"})
		return
	}

	c.Header("Content-Type", "image/png")
	c.Header("Cache-Control", "no-store")
	c.Writer.WriteHeader(http.StatusOK)
	_, _ = c.Writer.Write(png)
}
