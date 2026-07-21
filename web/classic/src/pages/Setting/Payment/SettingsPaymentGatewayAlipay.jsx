/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useState, useRef } from 'react';
import { Banner, Button, Form, Row, Col, Spin } from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

function parseAlipayConfig(raw) {
  const fields = {
    AlipayAppId: '',
    AlipayPrivateKey: '',
    AlipayPublicKey: '',
    AlipayPayType: 'facepay',
  };
  if (!raw) return fields;
  try {
    const parsed = JSON.parse(raw);
    fields.AlipayAppId = parsed.app_id || '';
    fields.AlipayPrivateKey = parsed.private_key || '';
    fields.AlipayPublicKey = parsed.public_key || '';
    fields.AlipayPayType = parsed.pay_type || 'facepay';
  } catch (_) {}
  return fields;
}

export default function SettingsPaymentGatewayAlipay(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle
    ? undefined
    : t('支付宝当面付设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    AlipayAppId: '',
    AlipayPrivateKey: '',
    AlipayPublicKey: '',
    AlipayPayType: 'facepay',
  });
  const [originAlipayConfig, setOriginAlipayConfig] = useState('');
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = parseAlipayConfig(props.options.AlipayConfig || '');
      setInputs(currentInputs);
      setOriginAlipayConfig(props.options.AlipayConfig || '');
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitAlipaySetting = async () => {
    const payload = {
      app_id: inputs.AlipayAppId?.trim(),
      private_key: inputs.AlipayPrivateKey?.trim(),
      public_key: inputs.AlipayPublicKey?.trim(),
      pay_type: inputs.AlipayPayType?.trim() || 'facepay',
    };
    const hasConfig =
      payload.app_id || payload.private_key || payload.public_key;
    const nextConfig = hasConfig ? JSON.stringify(payload) : '';

    if (originAlipayConfig === nextConfig) {
      showSuccess(t('未检测到变更'));
      return;
    }

    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'AlipayConfig',
        value: nextConfig,
      });
      if (res.data.success) {
        showSuccess(t('更新成功'));
        setOriginAlipayConfig(nextConfig);
        props.refresh && props.refresh();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(t('更新失败'));
    }
    setLoading(false);
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={sectionTitle}>
          <Banner
            type='info'
            icon={<Info size={16} />}
            description={t(
              '用于支付宝官方当面付/电脑网站支付/手机网站支付。回调：/api/alipay/notify',
            )}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input field='AlipayAppId' label={t('App ID')} />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='AlipayPayType'
                label={t('支付方式')}
                placeholder='facepay / pagepay / wappay'
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='AlipayPrivateKey'
                label={t('应用私钥')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input field='AlipayPublicKey' label={t('支付宝公钥')} />
            </Col>
          </Row>
          <Button onClick={submitAlipaySetting} style={{ marginTop: 16 }}>
            {t('更新支付宝当面付设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
