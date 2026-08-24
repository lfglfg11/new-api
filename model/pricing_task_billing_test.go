package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestResolveTaskBillingUnit(t *testing.T) {
	originalPatches := constant.TaskPricePatches
	constant.TaskPricePatches = []string{"video-per-request"}
	t.Cleanup(func() {
		constant.TaskPricePatches = originalPatches
	})

	tests := []struct {
		name      string
		modelName string
		quotaType int
		endpoints []constant.EndpointType
		expected  string
	}{
		{
			name:      "token model has no fixed billing unit",
			modelName: "video-token",
			quotaType: 0,
			endpoints: []constant.EndpointType{constant.EndpointTypeOpenAIVideo},
			expected:  "",
		},
		{
			name:      "video fixed price defaults to per second",
			modelName: "video-per-second",
			quotaType: 1,
			endpoints: []constant.EndpointType{constant.EndpointTypeOpenAIVideo},
			expected:  "second",
		},
		{
			name:      "task price patch marks video as per request",
			modelName: "video-per-request",
			quotaType: 1,
			endpoints: []constant.EndpointType{constant.EndpointTypeOpenAIVideo},
			expected:  "request",
		},
		{
			name:      "non video fixed price stays per request",
			modelName: "image-per-request",
			quotaType: 1,
			endpoints: []constant.EndpointType{constant.EndpointTypeImageGeneration},
			expected:  "request",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, resolveTaskBillingUnit(tt.modelName, tt.quotaType, tt.endpoints))
		})
	}
}
