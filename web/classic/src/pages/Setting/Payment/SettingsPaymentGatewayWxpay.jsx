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

function parseWxpayConfig(raw) {
  const fields = {
    WxpayAppId: '',
    WxpayMchId: '',
    WxpayMchCertificateSerialNumber: '',
    WxpayMchAPIv3Key: '',
    WxpayMchPrivateKey: '',
    WxpayPayType: 'Native',
  };
  if (!raw) return fields;
  try {
    const parsed = JSON.parse(raw);
    fields.WxpayAppId = parsed.app_id || '';
    fields.WxpayMchId = parsed.mch_id || '';
    fields.WxpayMchCertificateSerialNumber =
      parsed.mch_certificate_serial_number || '';
    fields.WxpayMchAPIv3Key = parsed.mch_apiv3_key || '';
    fields.WxpayMchPrivateKey = parsed.mch_private_key || '';
    fields.WxpayPayType = parsed.pay_type || 'Native';
  } catch (_) {}
  return fields;
}

export default function SettingsPaymentGatewayWxpay(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle
    ? undefined
    : t('微信支付设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    WxpayAppId: '',
    WxpayMchId: '',
    WxpayMchCertificateSerialNumber: '',
    WxpayMchAPIv3Key: '',
    WxpayMchPrivateKey: '',
    WxpayPayType: 'Native',
  });
  const [originWxpayConfig, setOriginWxpayConfig] = useState('');
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = parseWxpayConfig(props.options.WxpayConfig || '');
      setInputs(currentInputs);
      setOriginWxpayConfig(props.options.WxpayConfig || '');
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitWxpaySetting = async () => {
    const payload = {
      app_id: inputs.WxpayAppId?.trim(),
      mch_id: inputs.WxpayMchId?.trim(),
      mch_certificate_serial_number:
        inputs.WxpayMchCertificateSerialNumber?.trim(),
      mch_apiv3_key: inputs.WxpayMchAPIv3Key?.trim(),
      mch_private_key: inputs.WxpayMchPrivateKey?.trim(),
      pay_type: inputs.WxpayPayType?.trim() || 'Native',
    };
    const hasConfig =
      payload.app_id ||
      payload.mch_id ||
      payload.mch_certificate_serial_number ||
      payload.mch_apiv3_key ||
      payload.mch_private_key;
    const nextConfig = hasConfig ? JSON.stringify(payload) : '';

    if (originWxpayConfig === nextConfig) {
      showSuccess(t('未检测到变更'));
      return;
    }

    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'WxpayConfig',
        value: nextConfig,
      });
      if (res.data.success) {
        showSuccess(t('更新成功'));
        setOriginWxpayConfig(nextConfig);
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
              '用于微信支付官方 Native 扫码。回调：/api/wxpay/notify。商户私钥可填 PEM 内容或服务器上的密钥文件路径。',
            )}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input field='WxpayAppId' label={t('App ID')} />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input field='WxpayMchId' label={t('商户号 Mch ID')} />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='WxpayMchCertificateSerialNumber'
                label={t('证书序列号')}
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='WxpayPayType'
                label={t('支付方式')}
                placeholder='Native'
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='WxpayMchAPIv3Key'
                label={t('APIv3 Key')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='WxpayMchPrivateKey'
                label={t('商户私钥路径或内容')}
              />
            </Col>
          </Row>
          <Button onClick={submitWxpaySetting} style={{ marginTop: 16 }}>
            {t('更新微信支付设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
