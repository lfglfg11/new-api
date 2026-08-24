package billing_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveTaskBillingUnit(t *testing.T) {
	originalModes := billingSetting.BillingMode
	originalPatches := constant.TaskPricePatches
	billingSetting.BillingMode = map[string]string{
		"configured-per-request": BillingModePerRequest,
		"configured-per-second":  BillingModePerSecond,
	}
	constant.TaskPricePatches = []string{
		"legacy-per-request",
		"configured-per-second",
	}
	t.Cleanup(func() {
		billingSetting.BillingMode = originalModes
		constant.TaskPricePatches = originalPatches
	})

	tests := []struct {
		name         string
		model        string
		isVideoModel bool
		expected     string
	}{
		{
			name:         "explicit per second overrides legacy whitelist",
			model:        "configured-per-second",
			isVideoModel: true,
			expected:     TaskBillingUnitSecond,
		},
		{
			name:         "explicit per request is honored",
			model:        "configured-per-request",
			isVideoModel: true,
			expected:     TaskBillingUnitRequest,
		},
		{
			name:         "legacy whitelist remains per request",
			model:        "legacy-per-request",
			isVideoModel: true,
			expected:     TaskBillingUnitRequest,
		},
		{
			name:         "unconfigured video model defaults to per second",
			model:        "legacy-per-second",
			isVideoModel: true,
			expected:     TaskBillingUnitSecond,
		},
		{
			name:         "unconfigured non video fixed price remains per request",
			model:        "image-model",
			isVideoModel: false,
			expected:     TaskBillingUnitRequest,
		},
	}

	require.NotEmpty(t, tests)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, ResolveTaskBillingUnit(tt.model, tt.isVideoModel))
		})
	}
}

func TestShouldApplyTaskBillingRatios(t *testing.T) {
	originalModes := billingSetting.BillingMode
	originalPatches := constant.TaskPricePatches
	billingSetting.BillingMode = map[string]string{
		"configured-per-request": BillingModePerRequest,
		"configured-per-second":  BillingModePerSecond,
	}
	constant.TaskPricePatches = []string{
		"legacy-per-request",
		"configured-per-second",
	}
	t.Cleanup(func() {
		billingSetting.BillingMode = originalModes
		constant.TaskPricePatches = originalPatches
	})

	assert.False(t, ShouldApplyTaskBillingRatios("configured-per-request"))
	assert.True(t, ShouldApplyTaskBillingRatios("configured-per-second"))
	assert.False(t, ShouldApplyTaskBillingRatios("legacy-per-request"))
	assert.True(t, ShouldApplyTaskBillingRatios("legacy-per-second"))
}
