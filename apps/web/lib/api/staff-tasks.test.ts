import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaffTask } from './staff-tasks';

/**
 * Creating a task assigns work to a named person, so the client must post the
 * title and assignee to the right endpoint with the bearer token — a dropped
 * assignee would create an unassignable task the board can't route.
 */
afterEach(() => vi.unstubAllGlobals());

describe('createStaffTask', () => {
  it('posts title, assignee and priority to the staff-tasks endpoint', async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('{"id":"t-1"}', { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await createStaffTask(
      { title: 'Инвентаризация склада', assigneeId: 'staff-9', priority: 'high' },
      'tok-xyz',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/staff-tasks');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-xyz');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Инвентаризация склада',
      assigneeId: 'staff-9',
      priority: 'high',
    });
  });
});
