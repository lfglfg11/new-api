package model

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/stretchr/testify/require"
)

// The classic pricing editor persists per-request and per-second models through
// the same options endpoint as ratio models, so the validator must accept every
// billing mode this deployment can write.
func TestValidateModelPricingAcceptsPersistedBillingModes(t *testing.T) {
	for _, mode := range []string{
		billing_setting.BillingModeRatio,
		billing_setting.BillingModePerRequest,
		billing_setting.BillingModePerSecond,
	} {
		values := PricingValues{"billing_setting.billing_mode": mode}
		if mode == billing_setting.BillingModePerRequest || mode == billing_setting.BillingModePerSecond {
			values["ModelPrice"] = 4.0
		}
		require.NoError(t, ValidateModelPricing("classic-editor-model", values), "billing mode %s must be saveable", mode)
	}
}

func TestValidateModelPricingRejectsUnknownBillingMode(t *testing.T) {
	// "per-token" is the editor's UI value; it must never reach storage.
	err := ValidateModelPricing("classic-editor-model", PricingValues{"billing_setting.billing_mode": "per-token"})
	require.ErrorContains(t, err, "invalid billing mode")
}
