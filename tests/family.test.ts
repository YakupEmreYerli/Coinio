import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { openDb } from '../src/server/db/client.js';
import type { CoinioPlugin } from '../src/server/plugins.js';
import { deleteUser } from '../src/server/services/users.js';
import { importWallos } from '../src/server/services/wallosImport.js';
import { addUser, makeTestApp, publicLookup } from './helpers.js';

async function setupOwner(t = makeTestApp()) {
  const owner = request.agent(t.app);
  await owner.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  await owner.patch('/api/settings').send({ baseCurrency: 'USD' });
  return { ...t, owner };
}

function makePluginApp(plugins: CoinioPlugin[]) {
  const db = openDb(':memory:');
  const config = {
    ...loadConfig({}),
    dataDir: mkdtempSync(join(tmpdir(), 'coinio-family-')),
    publicUrl: 'http://localhost:4660',
  };
  let now = new Date('2026-11-18T09:00:00Z');
  const app = createApp({ db, config, now: () => now, lookup: publicLookup, plugins });
  return {
    app,
    db,
    config,
    clock: {
      get now() {
        return now;
      },
      set(d: Date | string) {
        now = new Date(d);
      },
    },
  };
}

describe('family & household API', () => {
  it('returns null household before creation and enforces member cap of 12', async () => {
    const { owner } = await setupOwner();
    const initial = await owner.get('/api/family');
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ household: null, members: [], invites: [], allowInviteSignup: true });

    const created = await owner.post('/api/family').send({ name: 'Evimiz', members: ['Annem', 'Babam'] });
    expect(created.status).toBe(201);
    expect(created.body.household.name).toBe('Evimiz');
    expect(created.body.household.myRole).toBe('owner');
    expect(created.body.members).toHaveLength(3);
    expect(created.body.members[0].role).toBe('owner');
    expect(created.body.members[0].linkedUsername).toBe('yakup');

    const dup = await owner.post('/api/family').send({ name: 'Second' });
    expect(dup.status).toBe(409);

    for (let i = 4; i <= 12; i++) {
      const r = await owner.post('/api/family/members').send({ name: `Uye ${i}` });
      expect(r.status).toBe(201);
    }
    const over = await owner.post('/api/family/members').send({ name: 'Uye 13' });
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('member_limit_reached');

    const renamed = await owner.patch('/api/family').send({ name: 'Yerli Ailesi' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.household.name).toBe('Yerli Ailesi');
  });

  it('supports self-hosted invite signup, single-use & expiry rules, and plugin allowInviteSignup=false', async () => {
    const t = await setupOwner();
    const fam = (await t.owner.post('/api/family').send({ name: 'Ailem', members: ['Annem', 'Kardesim'] })).body;
    const momId = fam.members[1].id as number;
    const broId = fam.members[2].id as number;

    const inv1 = await t.owner.post('/api/family/invites').send({ memberId: momId });
    expect(inv1.status).toBe(201);
    expect(inv1.body.path).toBe(`/invite/${inv1.body.token}`);

    // Preview does not leak usernames or internal IDs.
    const prev = await request(t.app).get(`/api/family/invite/${inv1.body.token}`);
    expect(prev.status).toBe(200);
    expect(prev.body).toEqual({
      valid: true,
      expired: false,
      used: false,
      householdName: 'Ailem',
      memberName: 'Annem',
      memberRelation: null,
      allowInviteSignup: true,
      signedIn: false,
      alreadyInHousehold: false,
    });

    // Accept via self-hosted invite signup creates user + sets session cookie, and allows updating display name & relation.
    const momAgent = request.agent(t.app);
    const accepted = await momAgent
      .post(`/api/family/invite/${inv1.body.token}/accept`)
      .send({ username: 'annem', password: 'mom secret passphrase', displayName: 'Ayşe', relation: 'mother' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.created).toBe(true);

    // Linked member can see and update their own display name & relation (cannot edit other members).
    const momFamily = (await momAgent.get('/api/family')).body;
    const momProfile = momFamily.members.find((m: { isMe: boolean }) => m.isMe);
    expect(momProfile.name).toBe('Ayşe');
    expect(momProfile.relation).toBe('mother');
    expect(
      (await momAgent.patch(`/api/family/members/${momProfile.id}`).send({ name: 'Ayşe Hanım', relation: 'mother' })).status,
    ).toBe(200);
    expect((await momAgent.patch(`/api/family/members/${fam.members[0].id}`).send({ name: 'Nope' })).status).toBe(403);

    // Signed in session works immediately.
    const momState = await momAgent.get('/api/auth/state');
    expect(momState.body.user.username).toBe('annem');

    // Public /api/auth/setup remains closed!
    const publicSetup = await request(t.app).post('/api/auth/setup').send({ username: 'stranger', password: 'password1234' });
    expect(publicSetup.status).toBe(409);

    // Double accept fails with 409.
    const replay = await request(t.app)
      .post(`/api/family/invite/${inv1.body.token}/accept`)
      .send({ username: 'hacker', password: 'password1234' });
    expect(replay.status).toBe(409);

    // Expired invite fails with 410.
    const inv2 = (await t.owner.post('/api/family/invites').send({ memberId: broId })).body;
    t.clock.set(new Date(t.clock.now.getTime() + 8 * 86_400_000));
    const expiredAccept = await request(t.app)
      .post(`/api/family/invite/${inv2.token}/accept`)
      .send({ username: 'bro', password: 'brother secret pass' });
    expect(expiredAccept.status).toBe(410);

    // User already in a household cannot accept another invite.
    const thirdUser = addUser(t, 'outsider');
    const t2Owner = addUser(t, 'otherowner');
    const otherFam = (await t2Owner.agent.post('/api/family').send({ name: 'Other', members: ['Guest'] })).body;
    const otherInv = (await t2Owner.agent.post('/api/family/invites').send({ memberId: otherFam.members[1].id })).body;
    await thirdUser.agent.post('/api/family').send({ name: 'ThirdFam' });
    const conflict = await thirdUser.agent.post(`/api/family/invite/${otherInv.token}/accept`).send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('already_in_household');

    // When plugin sets allowInviteSignup=false, unauthenticated invite accept returns 401.
    const cloudApp = makePluginApp([{ name: 'no-invite-signup', allowInviteSignup: false }]);
    const { agent: cOwner } = addUser(cloudApp, 'cowner');
    const cFam = (await cOwner.post('/api/family').send({ name: 'CloudFam', members: ['C2'] })).body;
    const cInv = (await cOwner.post('/api/family/invites').send({ memberId: cFam.members[1].id })).body;
    const cPrev = await request(cloudApp.app).get(`/api/family/invite/${cInv.token}`);
    expect(cPrev.body.allowInviteSignup).toBe(false);
    const unauth = await request(cloudApp.app)
      .post(`/api/family/invite/${cInv.token}/accept`)
      .send({ username: 'c2', password: 'password1234' });
    expect(unauth.status).toBe(401);
  });

  it('enforces strict privacy on personal subs and proper shared permissions', async () => {
    const t = await setupOwner();
    const fam = (await t.owner.post('/api/family').send({ name: 'Ev', members: ['Esi'] })).body;
    const spouseId = fam.members[1].id as number;
    const inv = (await t.owner.post('/api/family/invites').send({ memberId: spouseId })).body;

    const spouse = request.agent(t.app);
    await spouse.post(`/api/family/invite/${inv.token}/accept`).send({ username: 'esi', password: 'spouse password 1' });
    await spouse.patch('/api/settings').send({ baseCurrency: 'USD' });

    // Owner creates 1 personal + 1 shared subscription.
    const personalRes = await t.owner.post('/api/subscriptions').send({
      name: 'Private Gym',
      amountMinor: 5000,
      currency: 'USD',
      cycle: 'monthly',
      intervalCount: 1,
      nextDue: '2026-12-01',
    });
    expect(personalRes.status).toBe(201);
    const personal = personalRes.body;
    const sharedRes = await t.owner.post('/api/subscriptions').send({
      name: 'Netflix',
      amountMinor: 1000,
      currency: 'USD',
      cycle: 'monthly',
      intervalCount: 1,
      nextDue: '2026-12-01',
      shared: true,
    });
    expect(sharedRes.status).toBe(201);
    const shared = sharedRes.body;

    // Spouse sees only shared subscription, never personal.
    const spouseList = (await spouse.get('/api/subscriptions')).body;
    expect(spouseList.map((s: { name: string }) => s.name)).toEqual(['Netflix']);
    expect(spouseList[0].myShareMinor).toBe(500);
    expect(spouseList[0].canEdit).toBe(false);
    expect((await spouse.get(`/api/subscriptions/${personal.id}`)).status).toBe(404);

    // Spouse can pay, skip, and undo on shared sub; cannot edit/delete owner's shared sub or manage family.
    expect((await spouse.patch(`/api/subscriptions/${shared.id}`).send({ name: 'Hacked' })).status).toBe(403);
    expect((await spouse.delete(`/api/subscriptions/${shared.id}`)).status).toBe(403);
    expect((await spouse.post('/api/family/members').send({ name: 'Nope' })).status).toBe(403);
    expect((await spouse.delete('/api/family')).status).toBe(403);

    const paid = await spouse.post(`/api/subscriptions/${shared.id}/pay`).send({});
    expect(paid.status).toBe(201);
    const paymentsList = (await t.owner.get(`/api/payments?subscriptionId=${shared.id}`)).body;
    expect(paymentsList).toHaveLength(1);
    expect((await spouse.delete(`/api/payments/${paid.body.id}`)).status).toBe(204);

    // Spouse creates their own shared sub; owner can edit/delete it too.
    const spouseSharedRes = await spouse.post('/api/subscriptions').send({
      name: 'Spotify Family',
      amountMinor: 600,
      currency: 'USD',
      cycle: 'monthly',
      intervalCount: 1,
      nextDue: '2026-12-10',
      shared: true,
    });
    expect(spouseSharedRes.status).toBe(201);
    const spouseShared = spouseSharedRes.body;
    expect(spouseShared.canEdit).toBe(true);
    const ownerEdited = await t.owner.patch(`/api/subscriptions/${spouseShared.id}`).send({ name: 'Spotify Duo' });
    expect(ownerEdited.status).toBe(200);
    expect(ownerEdited.body.name).toBe('Spotify Duo');
  });

  it('computes scope=mine, scope=family, memberId and custom splits accurately across summary & reports', async () => {
    const t = await setupOwner();
    const fam = (await t.owner.post('/api/family').send({ name: 'Home', members: ['Partner', 'Kid'] })).body;
    const [ownerM, partnerM, kidM] = fam.members as { id: number; name: string }[];

    // Owner personal $20 + shared custom split $30 ($20 owner, $10 partner).
    expect(
      (
        await t.owner.post('/api/subscriptions').send({
          name: 'Personal',
          amountMinor: 2000,
          currency: 'USD',
          cycle: 'monthly',
          intervalCount: 1,
          nextDue: '2026-11-25',
        })
      ).status,
    ).toBe(201);
    const sharedRes = await t.owner.post('/api/subscriptions').send({
      name: 'Internet',
      amountMinor: 3000,
      currency: 'USD',
      cycle: 'monthly',
      intervalCount: 1,
      nextDue: '2026-11-28',
      shared: true,
      paidByMemberId: partnerM!.id,
      splits: [
        { memberId: ownerM!.id, shareMinor: 2000 },
        { memberId: partnerM!.id, shareMinor: 1000 },
      ],
    });
    expect(sharedRes.status).toBe(201);
    const shared = sharedRes.body;

    // Invalid custom split sum rejected.
    const badSplit = await t.owner.patch(`/api/subscriptions/${shared.id}`).send({ amountMinor: 4000 });
    expect(badSplit.status).toBe(400);

    // scope=mine summary: 2000 + 2000 = 4000.
    const mineSummary = (await t.owner.get('/api/summary')).body;
    expect(mineSummary.monthlyAverageMinor).toBe(4000);

    // scope=family summary: full shared = 3000 (personal excluded).
    const familySummary = (await t.owner.get('/api/summary?scope=family')).body;
    expect(familySummary.monthlyAverageMinor).toBe(3000);

    // scope=family&memberId=partner: partner's 1000 share.
    const partnerSummary = (await t.owner.get(`/api/summary?scope=family&memberId=${partnerM!.id}`)).body;
    expect(partnerSummary.monthlyAverageMinor).toBe(1000);

    // scope=family&memberId=kid: kid isn't in Internet's splits or payer, so 0.
    const kidSubs = (await t.owner.get(`/api/subscriptions?scope=family&memberId=${kidM!.id}`)).body;
    expect(kidSubs).toHaveLength(0);

    // Reports include byMember breakdown.
    const rep = (await t.owner.get('/api/reports?scope=family')).body;
    expect(rep.top[0].monthlyMinor).toBe(3000);
    expect(rep.byMember).toEqual([
      expect.objectContaining({ memberId: ownerM!.id, monthlyMinor: 2000 }),
      expect.objectContaining({ memberId: partnerM!.id, monthlyMinor: 1000 }),
      expect.objectContaining({ memberId: kidM!.id, monthlyMinor: 0 }),
    ]);

    // Deleting partner member resets remaining custom split back to equal split for owner.
    await t.owner.delete(`/api/family/members/${partnerM!.id}`);
    const afterDeleteSub = (await t.owner.get(`/api/subscriptions/${shared.id}`)).body;
    expect(afterDeleteSub.myShareMinor).toBe(3000);
  });

  it('handles leaveFamily, member deletion, owner deletion and Wallos Paid By import safely', async () => {
    const t = await setupOwner();
    const fam = (await t.owner.post('/api/family').send({ name: 'Hane', members: ['Uye1', 'Uye2'] })).body;
    const m1 = fam.members[1].id as number;
    const m2 = fam.members[2].id as number;

    const inv1 = (await t.owner.post('/api/family/invites').send({ memberId: m1 })).body;
    const u1 = request.agent(t.app);
    const u1Res = (await u1.post(`/api/family/invite/${inv1.token}/accept`).send({ username: 'uye1', password: 'user1 password!' })).body;

    // Member creates a shared subscription and leaves.
    const sub1Res = await u1.post('/api/subscriptions').send({
      name: 'Power',
      amountMinor: 900,
      currency: 'USD',
      cycle: 'monthly',
      intervalCount: 1,
      nextDue: '2026-12-01',
      shared: true,
    });
    expect(sub1Res.status).toBe(201);
    const sub1 = sub1Res.body;
    expect((await t.owner.post('/api/family/leave')).status).toBe(400);
    expect((await u1.post('/api/family/leave')).status).toBe(204);
    expect((await u1.get('/api/family')).body.household).toBeNull();
    // Shared sub survived on owner!
    expect((await t.owner.get(`/api/subscriptions/${sub1.id}`)).status).toBe(200);

    // Wallos Paid By matching member name marks imported sub as shared with that payer.
    const ctx = { db: t.db, config: t.config, now: () => t.clock.now, fetch, lookup: publicLookup };
    const imp = importWallos(
      ctx,
      1,
      [
        {
          Name: 'Water Bill',
          'Payment Cycle': 'Monthly',
          'Next Payment': '2026-12-05',
          Renewal: 'Automatic',
          Price: '$15.00',
          'Paid By': 'uye2',
        },
      ],
      false,
    );
    expect(imp.created).toBe(1);
    const allSubs = (await t.owner.get('/api/subscriptions')).body;
    const water = allSubs.find((s: { name: string }) => s.name === 'Water Bill');
    expect(water.householdId).toBe(fam.household.id);
    expect(water.paidByMemberId).toBe(m2);

    // Invite uye2 then delete uye1 directly via deleteUser after relinking -> shared subs stay on owner.
    const inv2 = (await t.owner.post('/api/family/invites').send({ memberId: m2 })).body;
    const u2 = request.agent(t.app);
    const u2Res = (await u2.post(`/api/family/invite/${inv2.token}/accept`).send({ username: 'uye2', password: 'user2 password!' })).body;
    const u2SharedRes = await u2.post('/api/subscriptions').send({
      name: 'Gas',
      amountMinor: 1200,
      currency: 'USD',
      cycle: 'monthly',
      intervalCount: 1,
      nextDue: '2026-12-08',
      shared: true,
    });
    expect(u2SharedRes.status).toBe(201);
    const u2Shared = u2SharedRes.body;

    deleteUser(ctx, u2Res.userId as number);
    expect((await t.owner.get(`/api/subscriptions/${u2Shared.id}`)).status).toBe(200);

    // Re-link uye1 then delete family: all shared subs detach cleanly.
    const inv1b = (await t.owner.post('/api/family/invites').send({ memberId: m1 })).body;
    await u1.post(`/api/family/invite/${inv1b.token}/accept`).send({});
    expect((await t.owner.delete('/api/family')).status).toBe(204);
    expect((await t.owner.get(`/api/subscriptions/${sub1.id}`)).body.householdId).toBeNull();
    // Clean up u1Res unused warning.
    expect(u1Res.userId).toBeGreaterThan(0);
  });
});
