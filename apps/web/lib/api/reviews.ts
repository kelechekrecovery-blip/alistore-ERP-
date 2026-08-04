import { API_BASE, postAuthJson } from './http';

export type ProductReviewModerationStatus = 'pending' | 'approved' | 'rejected';

export interface ModeratedProductReview {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  customerName: string;
  orderId: string;
  rating: number;
  text: string | null;
  status: ProductReviewModerationStatus;
  moderatedBy: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
  createdAt: string;
}

export async function fetchReviewModerationQueue(
  status: ProductReviewModerationStatus,
  accessToken: string,
): Promise<{ status: ProductReviewModerationStatus; items: ModeratedProductReview[] }> {
  const response = await fetch(`${API_BASE}/products/reviews/moderation?status=${status}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`review moderation responded ${response.status}`);
  return response.json() as Promise<{ status: ProductReviewModerationStatus; items: ModeratedProductReview[] }>;
}

export function moderateProductReview(
  reviewId: string,
  input: { action: 'approve' | 'reject'; reason?: string },
  accessToken: string,
): Promise<ModeratedProductReview> {
  return postAuthJson(`/products/reviews/${encodeURIComponent(reviewId)}/moderate`, input, accessToken);
}
