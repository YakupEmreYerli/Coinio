import { describe, expect, it } from 'vitest';
import { getAppearance, setAppearance } from '../src/server/services/appearance.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { getSettings, updateSettings } from '../src/server/services/settings.js';
import { addUser, makeTestApp } from './helpers.js';

describe('per-user settings', () => {
  it('keeps one user’s settings and appearance away from another', () => {
    const t = makeTestApp();
    const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
    const a = addUser(t, 'a');
    const b = addUser(t, 'b');
    updateSettings(ctx, a.id, { baseCurrency: 'TRY' });
    setAppearance(ctx, a.id, { ...getAppearance(ctx, a.id), theme: 'night' });
    expect(getSettings(ctx, a.id).baseCurrency).toBe('TRY');
    expect(getSettings(ctx, b.id).baseCurrency).toBe('USD');
    expect(getAppearance(ctx, b.id)).toEqual(getAppearance(ctx, 0));
    expect(getAppearance(ctx, a.id).theme).toBe('night');
  });

  it('serves each signed-in user their own settings over HTTP', async () => {
    const t = makeTestApp();
    const a = addUser(t, 'a');
    const b = addUser(t, 'b');
    await a.agent.patch('/api/settings').send({ baseCurrency: 'TRY' }).expect(200);
    expect((await b.agent.get('/api/settings').expect(200)).body.baseCurrency).toBe('USD');
    expect((await a.agent.get('/api/settings').expect(200)).body.baseCurrency).toBe('TRY');
  });
});
