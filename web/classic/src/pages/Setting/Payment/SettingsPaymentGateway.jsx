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
import {
  Banner,
  Button,
  Form,
  Row,
  Col,
  Spin,
  Typography,
} from '@douyinfe/semi-ui';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

const { Text } = Typography;

const emptyAlipayFields = {
  AlipayAppId: '',
  AlipayPrivateKey: '',
  AlipayPublicKey: '',
  AlipayPayType: 'facepay',
};

const emptyWxpayFields = {
  WxpayAppId: '',
  WxpayMchId: '',
  WxpayMchCertificateSerialNumber: '',
  WxpayMchAPIv3Key: '',
  WxpayMchPrivateKey: '',
  WxpayPayType: 'Native',
};

function parseAlipayConfig(raw) {
  const fields = { ...emptyAlipayFields };
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

function parseWxpayConfig(raw) {
  const fields = { ...emptyWxpayFields };
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

export default function SettingsPaymentGateway(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle ? undefined : t('易支付设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    PayAddress: '',
    EpayId: '',
    EpayKey: '',
    Price: 7.3,
    MinTopUp: 1,
    AlipayConfig: '',
    WxpayConfig: '',
    ...emptyAlipayFields,
    ...emptyWxpayFields,
  });
  const [originConfigs, setOriginConfigs] = useState({
    AlipayConfig: '',
    WxpayConfig: '',
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const alipayFields = parseAlipayConfig(props.options.AlipayConfig || '');
      const wxpayFields = parseWxpayConfig(props.options.WxpayConfig || '');
      const currentInputs = {
        PayAddress: props.options.PayAddress || '',
        EpayId: props.options.EpayId || '',
        EpayKey: props.options.EpayKey || '',
        Price:
          props.options.Price !== undefined
            ? parseFloat(props.options.Price)
            : 7.3,
        MinTopUp:
          props.options.MinTopUp !== undefined
            ? parseFloat(props.options.MinTopUp)
            : 1,
        AlipayConfig: props.options.AlipayConfig || '',
        WxpayConfig: props.options.WxpayConfig || '',
        ...alipayFields,
        ...wxpayFields,
      };

      setInputs(currentInputs);
      setOriginConfigs({
        AlipayConfig: props.options.AlipayConfig || '',
        WxpayConfig: props.options.WxpayConfig || '',
      });
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitPayAddress = async () => {
    if (props.options.ServerAddress === '') {
      showError(t('请先填写服务器地址'));
      return;
    }

    const alipayConfigPayload = {
      app_id: inputs.AlipayAppId?.trim(),
      private_key: inputs.AlipayPrivateKey?.trim(),
      public_key: inputs.AlipayPublicKey?.trim(),
      pay_type: inputs.AlipayPayType?.trim() || 'facepay',
    };
    const hasAlipayConfig =
      alipayConfigPayload.app_id ||
      alipayConfigPayload.private_key ||
      alipayConfigPayload.public_key;
    const nextAlipayConfig = hasAlipayConfig
      ? JSON.stringify(alipayConfigPayload)
      : '';

    const wxpayConfigPayload = {
      app_id: inputs.WxpayAppId?.trim(),
      mch_id: inputs.WxpayMchId?.trim(),
      mch_certificate_serial_number:
        inputs.WxpayMchCertificateSerialNumber?.trim(),
      mch_apiv3_key: inputs.WxpayMchAPIv3Key?.trim(),
      mch_private_key: inputs.WxpayMchPrivateKey?.trim(),
      pay_type: inputs.WxpayPayType?.trim() || 'Native',
    };
    const hasWxpayConfig =
      wxpayConfigPayload.app_id ||
      wxpayConfigPayload.mch_id ||
      wxpayConfigPayload.mch_certificate_serial_number ||
      wxpayConfigPayload.mch_apiv3_key ||
      wxpayConfigPayload.mch_private_key;
    const nextWxpayConfig = hasWxpayConfig
      ? JSON.stringify(wxpayConfigPayload)
      : '';

    setLoading(true);
    try {
      const options = [
        { key: 'PayAddress', value: removeTrailingSlash(inputs.PayAddress) },
      ];

      if (inputs.EpayId !== '') {
        options.push({ key: 'EpayId', value: inputs.EpayId });
      }
      if (inputs.EpayKey !== undefined && inputs.EpayKey !== '') {
        options.push({ key: 'EpayKey', value: inputs.EpayKey });
      }
      if (inputs.Price !== '') {
        options.push({ key: 'Price', value: inputs.Price.toString() });
      }
      if (inputs.MinTopUp !== '') {
        options.push({ key: 'MinTopUp', value: inputs.MinTopUp.toString() });
      }
      if (originConfigs.AlipayConfig !== nextAlipayConfig) {
        options.push({ key: 'AlipayConfig', value: nextAlipayConfig });
      }
      if (originConfigs.WxpayConfig !== nextWxpayConfig) {
        options.push({ key: 'WxpayConfig', value: nextWxpayConfig });
      }

      const requestQueue = options.map((opt) =>
        API.put('/api/option/', {
          key: opt.key,
          value: opt.value,
        }),
      );

      const results = await Promise.all(requestQueue);

      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => {
          showError(res.data.message);
        });
      } else {
        showSuccess(t('更新成功'));
        setOriginConfigs({
          AlipayConfig: nextAlipayConfig,
          WxpayConfig: nextWxpayConfig,
        });
        props.refresh && props.refresh();
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
              '易支付回调地址请在通用设置中配置。下方支付宝/微信为独立网关配置，可与易支付并存。',
            )}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='PayAddress'
                label={t('支付地址')}
                placeholder={t('例如：https://yourdomain.com')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='EpayId'
                label={t('商户 ID')}
                placeholder={t('例如：1001')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='EpayKey'
                label={t('API 密钥')}
                placeholder={t('敏感信息不会发送到前端显示')}
                type='password'
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.InputNumber
                field='Price'
                precision={2}
                label={t('充值价格（x元/美元）')}
                placeholder={t('例如：7，就是7元/美元')}
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.InputNumber
                field='MinTopUp'
                label={t('最低充值美元数量')}
                placeholder={t('例如：1，就是最低充值 $1')}
              />
            </Col>
          </Row>

          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 24 }}
          >
            <Col span={24}>
              <Text strong>{t('支付宝当面付配置')}</Text>
              <Text type='tertiary' style={{ display: 'block', marginTop: 4 }}>
                {t(
                  '用于支付宝官方当面付/电脑网站支付/手机网站支付。回调：/api/alipay/notify',
                )}
              </Text>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input field='AlipayAppId' label={t('App ID')} />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='AlipayPrivateKey'
                label={t('应用私钥')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input field='AlipayPublicKey' label={t('支付宝公钥')} />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='AlipayPayType'
                label={t('支付方式')}
                placeholder='facepay / pagepay / wappay'
              />
            </Col>
          </Row>

          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 24 }}
          >
            <Col span={24}>
              <Text strong>{t('微信支付配置')}</Text>
              <Text type='tertiary' style={{ display: 'block', marginTop: 4 }}>
                {t(
                  '用于微信支付官方 Native 扫码。回调：/api/wxpay/notify。商户私钥可填 PEM 内容或服务器上的密钥文件路径。',
                )}
              </Text>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input field='WxpayAppId' label={t('App ID')} />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input field='WxpayMchId' label={t('商户号 Mch ID')} />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WxpayMchCertificateSerialNumber'
                label={t('证书序列号')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WxpayMchAPIv3Key'
                label={t('APIv3 Key')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WxpayMchPrivateKey'
                label={t('商户私钥路径或内容')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WxpayPayType'
                label={t('支付方式')}
                placeholder='Native'
              />
            </Col>
          </Row>

          <Button onClick={submitPayAddress} style={{ marginTop: 16 }}>
            {t('更新支付设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
