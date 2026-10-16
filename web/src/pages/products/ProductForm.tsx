import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { AdminMeta, Nutrition, ProductDetail, ProductInput, ProductStatus, VariantType } from '@/api/types';
import { INGREDIENT_GROUP_LABEL, STATUS_LABEL, VARIANT_TYPE_LABEL } from '@/lib/labels';

const NUTRITION_FIELDS: { name: keyof Nutrition; label: string; unit: string }[] = [
  { name: 'caloriesKcal', label: '열량', unit: 'kcal' },
  { name: 'servingSizeG', label: '중량', unit: 'g' },
  { name: 'proteinG', label: '단백질', unit: 'g' },
  { name: 'carbohydrateG', label: '탄수화물', unit: 'g' },
  { name: 'sugarG', label: '당류', unit: 'g' },
  { name: 'fatG', label: '지방', unit: 'g' },
  { name: 'saturatedFatG', label: '포화지방', unit: 'g' },
  { name: 'sodiumMg', label: '나트륨', unit: 'mg' },
];

interface VariantFormValue {
  id?: string;
  name: string;
  variantType: VariantType;
  isDefault: boolean;
  isActive: boolean;
  initialStorePrice?: number | null;
  /** 브랜드가 영양 정보를 제공하는지 */
  hasNutrition: boolean;
  nutrition?: Partial<Record<keyof Nutrition, number | null>>;
}

interface FormValues {
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  status: ProductStatus;
  isLimited: boolean;
  releasedAt?: Dayjs | null;
  discontinuedAt?: Dayjs | null;
  variants: VariantFormValue[];
  ingredientIds: string[];
  tagIds: string[];
}

const NEW_PRODUCT: Partial<FormValues> = {
  status: 'ACTIVE',
  isLimited: false,
  ingredientIds: [],
  tagIds: [],
  variants: [
    { name: '단품', variantType: 'SINGLE', isDefault: true, isActive: true, hasNutrition: true },
    { name: '세트', variantType: 'SET', isDefault: false, isActive: true, hasNutrition: false },
  ],
};

function toFormValues(p: ProductDetail): FormValues {
  return {
    brandId: p.brandId,
    categoryId: p.categoryId,
    name: p.name,
    slug: p.slug,
    description: p.description ?? undefined,
    status: p.status,
    isLimited: p.isLimited,
    releasedAt: p.releasedAt ? dayjs(p.releasedAt) : null,
    discontinuedAt: p.discontinuedAt ? dayjs(p.discontinuedAt) : null,
    ingredientIds: p.ingredientIds,
    tagIds: p.tagIds,
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      variantType: v.variantType,
      isDefault: v.isDefault,
      isActive: v.isActive,
      hasNutrition: v.nutrition !== null,
      nutrition: v.nutrition ?? undefined,
    })),
  };
}

/** 비워 둔 영양 항목은 null 로 보낸다. 0 으로 채우지 않는다. */
function toNutrition(value: VariantFormValue): Nutrition | null {
  if (!value.hasNutrition) return null;
  const n = value.nutrition ?? {};
  const pick = (key: keyof Nutrition) => (typeof n[key] === 'number' ? n[key] : null);
  return {
    caloriesKcal: n.caloriesKcal as number,
    servingSizeG: pick('servingSizeG'),
    proteinG: pick('proteinG'),
    carbohydrateG: pick('carbohydrateG'),
    sugarG: pick('sugarG'),
    fatG: pick('fatG'),
    saturatedFatG: pick('saturatedFatG'),
    sodiumMg: pick('sodiumMg'),
  };
}

function toInput(values: FormValues): ProductInput {
  return {
    brandId: values.brandId,
    categoryId: values.categoryId,
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description?.trim() || null,
    status: values.status,
    isLimited: values.isLimited,
    releasedAt: values.releasedAt ? values.releasedAt.format('YYYY-MM-DD') : null,
    discontinuedAt: values.discontinuedAt ? values.discontinuedAt.format('YYYY-MM-DD') : null,
    ingredientIds: values.ingredientIds,
    tagIds: values.tagIds,
    variants: values.variants.map((v) => ({
      id: v.id,
      name: v.name.trim(),
      variantType: v.variantType,
      isDefault: v.isDefault,
      isActive: v.isActive,
      nutrition: toNutrition(v),
      ...(v.id ? {} : { initialStorePrice: v.initialStorePrice ?? null }),
    })),
  };
}

interface Props {
  meta: AdminMeta;
  product?: ProductDetail;
  saving: boolean;
  onSubmit: (input: ProductInput) => void;
}

export function ProductForm({ meta, product, saving, onSubmit }: Props) {
  const [form] = Form.useForm<FormValues>();
  const isNew = !product;

  // 같은 그룹끼리 묶어서 보여준다. 선택한 순서가 표시 순서(sort_order)가 된다.
  const ingredientOptions = (Object.keys(INGREDIENT_GROUP_LABEL) as (keyof typeof INGREDIENT_GROUP_LABEL)[]).map(
    (group) => ({
      label: INGREDIENT_GROUP_LABEL[group],
      options: meta.ingredients.filter((i) => i.group === group).map((i) => ({ value: i.id, label: i.name })),
    }),
  );

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      initialValues={product ? toFormValues(product) : NEW_PRODUCT}
      onFinish={(values) => onSubmit(toInput(values))}
      scrollToFirstError
    >
      <Card title="기본 정보">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="brandId" label="브랜드" rules={[{ required: true, message: '브랜드를 선택해 주세요.' }]}>
              <Select options={meta.brands.map((b) => ({ value: b.id, label: b.isActive ? b.name : `${b.name} (중지)` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="categoryId" label="카테고리" rules={[{ required: true, message: '카테고리를 선택해 주세요.' }]}>
              <Select options={meta.categories.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="name" label="상품명" rules={[{ required: true, whitespace: true, message: '상품명을 입력해 주세요.' }]}>
              <Input maxLength={150} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="slug"
              label="slug"
              tooltip="사용자 사이트 주소에 쓰입니다. 같은 브랜드 안에서 중복될 수 없습니다."
              rules={[
                { required: true, message: 'slug 를 입력해 주세요.' },
                { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '영문 소문자, 숫자, - 만 쓸 수 있습니다.' },
              ]}
            >
              <Input maxLength={200} placeholder="bulgogi-whopper" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="description" label="설명">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="status" label="판매 상태" rules={[{ required: true }]}>
              <Select options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="isLimited" label="한정 메뉴" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="releasedAt" label="출시일">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="discontinuedAt" label="판매 종료일">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title="구성 (단품·세트)" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          영양 정보는 브랜드가 제공하는 값만 입력합니다. 제공하지 않으면 "영양 정보 제공"을 끄세요. 비워 둔 항목은 0이 아니라 "정보 없음"으로 저장됩니다.
          {!isNew && ' 기존 구성의 매장가는 아래 "매장가" 카드에서 바꿉니다.'}
        </Typography.Paragraph>
        <Form.List
          name="variants"
          rules={[
            {
              validator: async (_, variants: VariantFormValue[] = []) => {
                if (variants.length === 0) throw new Error('구성을 하나 이상 추가해 주세요.');
                if (variants.filter((v) => v?.isDefault).length !== 1) {
                  throw new Error('기본 구성은 정확히 하나여야 합니다.');
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map(({ key, name }) => (
                <VariantFields key={key} index={name} onRemove={() => remove(name)} />
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => add({ name: '', variantType: 'SET', isDefault: false, isActive: true, hasNutrition: false })}
              >
                구성 추가
              </Button>
            </>
          )}
        </Form.List>
      </Card>

      <Card title="재료와 태그" style={{ marginTop: 16 }}>
        <Form.Item
          name="ingredientIds"
          label="재료"
          extra="선택한 순서대로 표시됩니다. 패티는 비슷한 버거와 취향 리포트의 기준이 됩니다."
        >
          <Select mode="multiple" options={ingredientOptions} optionFilterProp="label" placeholder="재료 선택" />
        </Form.Item>
        <Form.Item name="tagIds" label="태그">
          <Select
            mode="multiple"
            options={meta.tags.map((t) => ({ value: t.id, label: t.name }))}
            optionFilterProp="label"
            placeholder="태그 선택"
          />
        </Form.Item>
      </Card>

      <Flex justify="end" style={{ marginTop: 16 }}>
        <Button type="primary" htmlType="submit" size="large" loading={saving}>
          {isNew ? '상품 등록' : '저장'}
        </Button>
      </Flex>
    </Form>
  );
}

function VariantFields({ index, onRemove }: { index: number; onRemove: () => void }) {
  const form = Form.useFormInstance<FormValues>();
  const id = Form.useWatch(['variants', index, 'id'], form);
  const hasNutrition = Form.useWatch(['variants', index, 'hasNutrition'], form);

  // 기본 구성은 하나만: 켜면 나머지를 끈다.
  const onDefaultChange = (checked: boolean) => {
    if (!checked) return;
    const variants = form.getFieldValue('variants') as VariantFormValue[];
    form.setFieldValue(
      'variants',
      variants.map((v, i) => ({ ...v, isDefault: i === index })),
    );
  };

  return (
    <Card size="small" type="inner" style={{ marginBottom: 12 }}>
      <Row gutter={12} align="bottom">
        <Col xs={24} md={6}>
          <Form.Item name={[index, 'name']} label="구성 이름" rules={[{ required: true, whitespace: true, message: '이름을 입력해 주세요.' }]}>
            <Input placeholder="단품" />
          </Form.Item>
        </Col>
        <Col xs={12} md={4}>
          <Form.Item name={[index, 'variantType']} label="종류" rules={[{ required: true }]}>
            <Select options={Object.entries(VARIANT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </Col>
        {!id && (
          <Col xs={12} md={5}>
            <Form.Item name={[index, 'initialStorePrice']} label="매장가">
              <InputNumber min={1} step={100} style={{ width: '100%' }} suffix="원" />
            </Form.Item>
          </Col>
        )}
        <Col xs={8} md={3}>
          <Form.Item name={[index, 'isDefault']} label="기본 구성" valuePropName="checked">
            <Switch onChange={onDefaultChange} />
          </Form.Item>
        </Col>
        <Col xs={8} md={3}>
          <Form.Item name={[index, 'isActive']} label="사용" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={8} md={3}>
          <Form.Item>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={onRemove}
              disabled={!!id}
              title={id ? '가격 이력이 있는 기존 구성은 삭제하지 않고 "사용"을 끕니다.' : undefined}
            >
              삭제
            </Button>
          </Form.Item>
        </Col>
      </Row>

      <Divider style={{ margin: '4px 0 12px' }} />
      <Form.Item name={[index, 'hasNutrition']} label="영양 정보 제공" valuePropName="checked">
        <Switch />
      </Form.Item>
      {hasNutrition && (
        <Row gutter={12}>
          {NUTRITION_FIELDS.map((f) => (
            <Col key={f.name} xs={12} md={6} lg={3}>
              <Form.Item
                name={[index, 'nutrition', f.name]}
                label={f.label}
                rules={f.name === 'caloriesKcal' ? [{ required: true, message: '열량은 필수입니다.' }] : undefined}
              >
                <InputNumber min={0} style={{ width: '100%' }} suffix={f.unit} />
              </Form.Item>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}
