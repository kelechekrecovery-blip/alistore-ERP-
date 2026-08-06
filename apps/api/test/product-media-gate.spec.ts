import { assessProductMedia } from '../src/products/product-media-gate';

describe('product media publication gate', () => {
  it('accepts only server-issued product media keys', () => {
    expect(assessProductMedia({ imageKey: 'media/11111111-1111-4111-8111-111111111111.webp' })).toEqual({
      ready: true,
      imageCount: 1,
      mediaKeys: ['media/11111111-1111-4111-8111-111111111111.webp'],
      reasons: [],
    });
    expect(assessProductMedia({ mediaKeys: ['media/11111111-1111-4111-8111-111111111111.webp', 'media/22222222-2222-4222-8222-222222222222.webp'] })).toEqual({
      ready: true,
      imageCount: 2,
      mediaKeys: ['media/11111111-1111-4111-8111-111111111111.webp', 'media/22222222-2222-4222-8222-222222222222.webp'],
      reasons: [],
    });
  });

  it('rejects missing, arbitrary URLs and non-media keys', () => {
    expect(assessProductMedia({})).toMatchObject({ ready: false, imageCount: 0 });
    expect(assessProductMedia({ imageUrl: 'https://example.com/phone.jpg' })).toMatchObject({ ready: false, imageCount: 0 });
    expect(assessProductMedia({ imageKey: 'evidence/not-a-product.webp' })).toMatchObject({ ready: false, imageCount: 0 });
  });
});
