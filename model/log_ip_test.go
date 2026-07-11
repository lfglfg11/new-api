package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestShouldRecordRequestIPUsesAdminSettingForAllUsers(t *testing.T) {
	setupUserUpdateTestState(t)

	user := User{
		Id:       1,
		Username: "common-user",
		Password: "password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "common-user-aff",
	}
	admin := User{
		Id:       2,
		Username: "admin-user",
		Password: "password",
		Role:     common.RoleAdminUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "admin-user-aff",
	}
	admin.SetSetting(dto.UserSetting{RecordIpLog: true})

	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Create(&admin).Error)
	clearAdminRecordIpLogCache()

	assert.True(t, shouldRecordRequestIP(user.Id))

	require.NoError(t, UpdateUserSetting(admin.Id, dto.UserSetting{}))
	assert.False(t, shouldRecordRequestIP(user.Id))
}

func TestShouldRecordRequestIPKeepsUserOwnSetting(t *testing.T) {
	setupUserUpdateTestState(t)

	user := User{
		Id:       3,
		Username: "opt-in-user",
		Password: "password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "opt-in-user-aff",
	}
	user.SetSetting(dto.UserSetting{RecordIpLog: true})

	require.NoError(t, DB.Create(&user).Error)
	clearAdminRecordIpLogCache()

	assert.True(t, shouldRecordRequestIP(user.Id))
}
