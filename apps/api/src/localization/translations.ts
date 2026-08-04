import { I18nTranslation } from 'nestjs-i18n';

/**
 * In-memory RU/КЫ translations. Kept in TS (not JSON files) so they compile into
 * dist without asset-copy config. Grow per feature; keys are `namespace.key`.
 */
export const TRANSLATIONS: I18nTranslation = {
  ru: {
    common: {
      greeting: 'Здравствуйте',
      order_paid: 'Заказ оплачен',
      reservation_expired: 'Бронь истекла, товар снова в наличии',
      forbidden: 'Недостаточно прав для этого действия',
    },
  },
  ky: {
    common: {
      greeting: 'Саламатсызбы',
      order_paid: 'Буйрутма төлөндү',
      reservation_expired: 'Брондоо мөөнөтү бүттү, товар кайра сатыкта',
      forbidden: 'Бул аракет үчүн укугуңуз жетишсиз',
    },
  },
};
