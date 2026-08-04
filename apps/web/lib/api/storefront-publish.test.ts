import { describe, expect, it } from 'vitest';
import { isParkedApproval, storefrontPublishNotice } from './storefront';

/**
 * POST /storefront/revisions/:id/publish is four-eyes gated on purpose — the
 * controller comment says a single marketer POST used to change the homepage for
 * every shopper. It answers 202 with a parked approval and does NOT publish.
 *
 * The ERP said "Версия vN опубликована" anyway, so a marketer walked away
 * believing the storefront was live while the revision sat in draft. This is the
 * message logic that has to tell those apart.
 */
describe('storefrontPublishNotice', () => {
  const parked = { approvalId: 'appr-7', status: 'requested' as const, action: 'storefront_publish' };

  it('says the revision is queued for approval, not published', () => {
    const notice = storefrontPublishNotice(3, parked);
    expect(notice).toMatch(/согласовани/iu);
    expect(notice).not.toMatch(/опубликована/iu);
    expect(notice).toContain('v3');
  });

  it('names the approval so the marketer can chase it', () => {
    expect(storefrontPublishNotice(3, parked)).toContain('appr-7');
  });

  it('still reports a direct publish as published, if the server ever stops gating', () => {
    const notice = storefrontPublishNotice(3, { id: 'rev-1', version: 3, status: 'published' });
    expect(notice).toMatch(/опубликована/iu);
  });
});

describe('isParkedApproval', () => {
  it('recognises the parked-approval envelope', () => {
    expect(isParkedApproval({ approvalId: 'a', status: 'requested', action: 'storefront_publish' })).toBe(true);
  });

  it('rejects a published revision and junk alike', () => {
    expect(isParkedApproval({ id: 'rev-1', status: 'published' })).toBe(false);
    expect(isParkedApproval(null)).toBe(false);
    expect(isParkedApproval('approvalId')).toBe(false);
  });
});
