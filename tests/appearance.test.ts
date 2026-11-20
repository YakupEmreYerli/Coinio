import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CARD_IDS, DEFAULT_APPEARANCE, forImport, mergeAppearance } from '../src/shared/appearance.js';
import { makeTestApp } from './helpers.js';

async function login() {
  const t = makeTestApp();
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  return { ...t, agent };
}

describe('appearance', () => {
  it('GET /api/appearance returns defaults on fresh install', async () => {
    const { agent } = await login();
    const res = await agent.get('/api/appearance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_APPEARANCE);
    expect(res.body).toMatchObject({ theme: 'paper', stack: 'rafine', accent: '#4f5bd5', density: 'comfy', logoShape: 'circle', cents: 'superscript' });
  });

  it('requires a session', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/api/appearance')).status).toBe(401);
  });

  it('PUT persists and GET returns it', async () => {
    const { agent } = await login();
    const next = { ...DEFAULT_APPEARANCE, theme: 'night', accent: '#ea6a12', customCss: '.x{color:red}', categoryColors: { 'Yapay zekâ': '#e8743b' } };
    const put = await agent.put('/api/appearance').send(next);
    expect(put.status).toBe(200);
    expect((await agent.get('/api/appearance')).body).toEqual(next);
  });

  it('invalid accent → 400', async () => {
    const { agent } = await login();
    const res = await agent.put('/api/appearance').send({ ...DEFAULT_APPEARANCE, accent: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('customCss over 50000 chars → 400', async () => {
    const { agent } = await login();
    expect((await agent.put('/api/appearance').send({ ...DEFAULT_APPEARANCE, customCss: 'a'.repeat(50_001) })).status).toBe(400);
  });

  it('mergeAppearance drops unknown card ids and appends missing ones', () => {
    const merged = mergeAppearance({ theme: 'bogus', cards: [{ id: 'stats', visible: false }, { id: 'nope', visible: true }] });
    expect(merged.theme).toBe('paper');
    expect(merged.cards[0]).toEqual({ id: 'stats', visible: false });
    expect(merged.cards.map((c) => c.id)).toEqual(['stats', ...CARD_IDS.filter((id) => id !== 'stats')]);
    expect(merged.cards.slice(1).every((c) => c.visible)).toBe(true);
  });

  it('mergeAppearance keeps html card entries that have a matching html card', () => {
    const merged = mergeAppearance({
      htmlCards: [{ id: 'note', title: 'Not', html: '<b>hi</b>', height: 200 }],
      cards: [{ id: 'html:note', visible: true }, { id: 'html:gone', visible: true }],
    });
    expect(merged.cards.map((c) => c.id)).toContain('html:note');
    expect(merged.cards.map((c) => c.id)).not.toContain('html:gone');
  });

  it('html card shareData: missing reads as false, true is kept, non-boolean is a 400', async () => {
    expect(mergeAppearance({ htmlCards: [{ id: 'a', title: '', html: '', height: 100 }] }).htmlCards[0]!.shareData).toBe(false);
    const { agent } = await login();
    const card = { id: 'a', title: '', html: '', height: 100, shareData: true };
    const res = await agent.put('/api/appearance').send({ ...DEFAULT_APPEARANCE, htmlCards: [card] });
    expect(res.status).toBe(200);
    expect((await agent.get('/api/appearance')).body.htmlCards[0].shareData).toBe(true);
    expect((await agent.put('/api/appearance').send({ ...DEFAULT_APPEARANCE, htmlCards: [{ ...card, shareData: 'yes' }] })).status).toBe(400);
  });

  it('forImport turns data sharing off on every imported card', () => {
    const theme = mergeAppearance({ htmlCards: [{ id: 'a', title: '', html: '', height: 100, shareData: true }] });
    expect(forImport(theme).htmlCards.every((c) => !c.shareData)).toBe(true);
  });
});
