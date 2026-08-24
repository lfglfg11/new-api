/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import { getStoredBillingMode } from '../model-pricing-core'
import {
  buildModelSnapshots,
  getDisplayPricingMode,
  getModeLabel,
  getPriceDetail,
  getPriceSummary,
  type ModelPricingSnapshot,
} from '../model-pricing-snapshots'

const t = (key: string) =>
  (
    ({
      request: '次',
      second: '秒',
      'Fixed price per generated second': '按生成视频秒数固定计费',
      'Fixed request price': '按次固定计费',
    }) as Record<string, string>
  )[key] ?? key

const emptySnapshotInput = {
  modelPrice: '{}',
  modelRatio: '{}',
  cacheRatio: '{}',
  createCacheRatio: '{}',
  completionRatio: '{}',
  imageRatio: '{}',
  audioRatio: '{}',
  audioCompletionRatio: '{}',
  billingMode: '{}',
  billingExpr: '{}',
}

const createFixedPriceRow = (
  taskBillingUnit: ModelPricingSnapshot['taskBillingUnit']
): ModelPricingSnapshot => ({
  name: 'video-model',
  price: '0.58',
  billingMode: 'per-request',
  taskBillingUnit,
  hasConflict: false,
})

describe('model pricing task billing unit display', () => {
  it('shows fixed-price video models with second-based labels and units', () => {
    const row = createFixedPriceRow('second')

    expect(getDisplayPricingMode(row)).toBe('per-second')
    expect(getModeLabel(row.billingMode, row.taskBillingUnit)).toBe(
      'Per-second'
    )
    expect(getPriceSummary(row, t)).toBe('$0.58 / 秒')
    expect(getPriceDetail(row, t)).toBe('按生成视频秒数固定计费')
  })

  it('keeps request-based fixed prices unchanged', () => {
    const row = createFixedPriceRow('request')

    expect(getDisplayPricingMode(row)).toBe('per-request')
    expect(getModeLabel(row.billingMode, row.taskBillingUnit)).toBe(
      'Per-request'
    )
    expect(getPriceSummary(row, t)).toBe('$0.58 / 次')
    expect(getPriceDetail(row, t)).toBe('按次固定计费')
  })
})

describe('model pricing task billing unit persistence', () => {
  it('parses explicit per-second and per-request modes from settings', () => {
    const rows = buildModelSnapshots({
      ...emptySnapshotInput,
      modelPrice: JSON.stringify({
        'video-per-second': 0.58,
        'video-per-request': 4.8,
      }),
      billingMode: JSON.stringify({
        'video-per-second': 'per_second',
        'video-per-request': 'per_request',
      }),
    })

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'video-per-second',
          billingMode: 'per-second',
          taskBillingUnit: 'second',
        }),
        expect.objectContaining({
          name: 'video-per-request',
          billingMode: 'per-request',
          taskBillingUnit: 'request',
        }),
      ])
    )
  })

  it('serializes editable pricing modes to backend billing modes', () => {
    expect(getStoredBillingMode('per-second')).toBe('per_second')
    expect(getStoredBillingMode('per-request')).toBe('per_request')
    expect(getStoredBillingMode('tiered_expr')).toBe('tiered_expr')
    expect(getStoredBillingMode('per-token')).toBeNull()
  })
})
