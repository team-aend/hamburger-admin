import type { IngredientGroup, ProductStatus, QualityWarningCode, VariantType } from '@/api/types';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: '판매 중',
  UPCOMING: '출시 예정',
  TEMPORARY: '기간 한정 판매',
  DISCONTINUED: '판매 종료',
};

export const STATUS_COLOR: Record<ProductStatus, string> = {
  ACTIVE: 'green',
  UPCOMING: 'blue',
  TEMPORARY: 'orange',
  DISCONTINUED: 'default',
};

export const VARIANT_TYPE_LABEL: Record<VariantType, string> = {
  SINGLE: '단품',
  SET: '세트',
  LARGE_SET: '라지 세트',
};

export const INGREDIENT_GROUP_LABEL: Record<IngredientGroup, string> = {
  PATTY: '패티',
  TOPPING: '토핑',
  CHEESE_SAUCE: '치즈·소스',
};

export const WARNING_INFO: Record<QualityWarningCode, { title: string; impact: string }> = {
  NO_IMAGE: { title: '이미지 없음', impact: '카드·상세·월드컵이 대체 이미지로 표시됩니다.' },
  NO_NUTRITION: { title: '영양 정보 없음', impact: '칼로리 필터·정렬에서 빠지거나 잘못 정렬됩니다.' },
  NO_STORE_PRICE: { title: '매장가 없음', impact: '최대 금액 필터를 항상 통과하고 취향 리포트 가격대가 왜곡됩니다.' },
  NO_INGREDIENTS: { title: '재료 연결 없음', impact: '포함·제외 필터와 비슷한 버거에서 빠집니다.' },
};

export const formatWon = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString('ko-KR')}원`;
