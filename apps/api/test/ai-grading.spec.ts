import { GradingService } from '../src/ai/grading.service';
import {
  buildPhotoGradingMessages,
  gradePhotosByRules,
  parsePhotoGradingResponse,
} from '../src/ai/grading';

describe('gradePhotosByRules', () => {
  it('keeps a complete clean photo set at grade A', () => {
    const result = gradePhotosByRules({
      model: 'iPhone 15 Pro',
      photos: [{ label: 'front' }, { label: 'back' }, { label: 'edges' }, { label: 'screen-on' }],
    });
    expect(result).toMatchObject({ source: 'rules', grade: 'A', defects: [] });
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('downgrades critical or heavy findings deterministically', () => {
    const result = gradePhotosByRules({
      photos: [{ label: 'front water damage' }, { label: 'screen scratch' }],
      observedDefects: ['battery wear'],
      claimedGrade: 'B',
    });
    expect(result.grade).toBe('C');
    expect(result.defects).toEqual(['battery_wear', 'critical_damage', 'screen_issue']);
    expect(result.recommendedChecks.some((check) => check.includes('влагу'))).toBe(true);
  });
});

describe('photo grading OpenRouter helpers', () => {
  it('builds a strict JSON prompt and parses a provider response', () => {
    const messages = buildPhotoGradingMessages({ photos: [{ url: 'https://cdn/a.webp', label: 'front' }] });
    expect(messages[0].content).toContain('JSON-объект');
    expect(messages[1].content).toContain('https://cdn/a.webp');

    const parsed = parsePhotoGradingResponse(
      '{"grade":"B","confidence":0.73,"defects":["body_wear"],"notes":["minor"],"recommendedChecks":["imei"]}',
    );
    expect(parsed).toEqual({
      grade: 'B',
      confidence: 0.73,
      defects: ['body_wear'],
      notes: ['minor'],
      recommendedChecks: ['imei'],
    });
  });

  it('falls back to rules when provider call fails', async () => {
    const oldKey = process.env.AI_PROVIDER_KEY;
    const oldFetch = global.fetch;
    process.env.AI_PROVIDER_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    try {
      const result = await new GradingService().grade({
        photos: [{ label: 'front screen scratch' }, { label: 'back' }],
      });
      expect(result.source).toBe('rules (fallback)');
      expect(result.grade).toBe('B');
    } finally {
      if (oldKey === undefined) delete process.env.AI_PROVIDER_KEY;
      else process.env.AI_PROVIDER_KEY = oldKey;
      global.fetch = oldFetch;
    }
  });
});
