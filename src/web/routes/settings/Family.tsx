import { Check, Link2, LogOut, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CopyField } from '../../components/CopyField';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import {
  useAddMember,
  useCreateFamily,
  useCreateInvite,
  useDeleteFamily,
  useDeleteMember,
  useFamily,
  useLeaveFamily,
  useRevokeInvite,
  useUpdateFamily,
  useUpdateMember,
} from '../../lib/hooks';
import type { ApiInviteCreated } from '../../lib/types';
import { Section } from './Section';

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];
const MAX_MEMBERS = 12;

export function FamilySettings() {
  const familyQuery = useFamily();
  const createFamily = useCreateFamily();
  const updateFamily = useUpdateFamily();
  const deleteFamily = useDeleteFamily();
  const leaveFamily = useLeaveFamily();
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();

  const [newFamilyName, setNewFamilyName] = useState('');
  const [initialMembers, setInitialMembers] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberColor, setMemberColor] = useState(PALETTE[1]!);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editingMemberName, setEditingMemberName] = useState('');
  const [latestInvite, setLatestInvite] = useState<ApiInviteCreated | null>(null);
  const [confirmDeleteFamily, setConfirmDeleteFamily] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<{ id: number; name: string } | null>(null);

  const data = familyQuery.data;
  const household = data?.household ?? null;
  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  useEffect(() => {
    if (household) setHouseholdName(household.name);
  }, [household?.name]);

  if (familyQuery.isPending) {
    return <p className="text-sm text-text-3">{t('common.loading')}</p>;
  }

  if (!household) {
    return (
      <Section
        title={t('family.createTitle')}
        description={t('family.createDesc')}
        footer={
          <Button
            variant="primary"
            disabled={!newFamilyName.trim() || createFamily.isPending}
            onClick={() => {
              const extra = initialMembers
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              createFamily.mutate(
                { name: newFamilyName.trim(), ...(extra.length ? { members: extra } : {}) },
                {
                  onSuccess: () => {
                    setNewFamilyName('');
                    setInitialMembers('');
                    toast.success(t('family.created'));
                  },
                },
              );
            }}
          >
            <Users aria-hidden />
            {t('family.createButton')}
          </Button>
        }
      >
        <Input
          label={t('family.nameLabel')}
          placeholder={t('family.namePlaceholder')}
          value={newFamilyName}
          onChange={(e) => setNewFamilyName(e.target.value)}
          maxLength={80}
        />
        <Input
          label={t('family.initialMembers')}
          placeholder={t('family.initialMembersPh')}
          hint={t('family.initialMembersHint')}
          value={initialMembers}
          onChange={(e) => setInitialMembers(e.target.value)}
        />
      </Section>
    );
  }

  const isOwner = household.myRole === 'owner';

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Section
        title={t('family.householdCard')}
        description={isOwner ? t('family.householdOwnerDesc') : t('family.householdMemberDesc')}
        footer={
          isOwner ? (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" className="text-neg hover:text-neg" onClick={() => setConfirmDeleteFamily(true)}>
                <Trash2 aria-hidden />
                {t('family.delete')}
              </Button>
              <Button
                variant="primary"
                disabled={!householdName.trim() || householdName.trim() === household.name || updateFamily.isPending}
                onClick={() =>
                  updateFamily.mutate(
                    { name: householdName.trim() },
                    { onSuccess: () => toast.success(t('family.renamed')) },
                  )
                }
              >
                {t('common.save')}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="text-neg hover:text-neg" onClick={() => setConfirmLeave(true)}>
              <LogOut aria-hidden />
              {t('family.leave')}
            </Button>
          )
        }
      >
        {isOwner ? (
          <Input
            label={t('family.nameLabel')}
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            maxLength={80}
          />
        ) : (
          <p className="text-[15px] font-medium">{household.name}</p>
        )}
      </Section>

      <Section
        title={t('family.membersTitle')}
        description={t('family.membersCount', { n: members.length, max: MAX_MEMBERS })}
      >
        <ul className="divide-y divide-line rounded-ctl border border-line bg-bg/40">
          {members.map((m) => {
            const pendingInvite = invites.find((inv) => inv.memberId === m.id);
            const isEditing = editingMemberId === m.id;
            return (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: m.color ?? '#6366f1' }} />
                  {isEditing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        aria-label={t('family.memberName')}
                        className="h-8 min-w-0 flex-1 rounded-[8px] border border-line-2 bg-card px-2.5 text-sm outline-none focus:border-accent"
                        value={editingMemberName}
                        onChange={(e) => setEditingMemberName(e.target.value)}
                        maxLength={60}
                      />
                      <Button
                        size="icon-sm"
                        variant="primary"
                        aria-label={t('common.save')}
                        disabled={!editingMemberName.trim()}
                        onClick={() =>
                          updateMember.mutate(
                            { id: m.id, patch: { name: editingMemberName.trim() } },
                            {
                              onSuccess: () => {
                                setEditingMemberId(null);
                                toast.success(t('family.memberSaved'));
                              },
                            },
                          )
                        }
                      >
                        <Check />
                      </Button>
                      <Button size="icon-sm" aria-label={t('common.cancel')} onClick={() => setEditingMemberId(null)}>
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        {m.isMe && <span className="rounded-full bg-sunk px-2 py-0.5 text-[11px] text-text-2">{t('family.you')}</span>}
                        {m.role === 'owner' && (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                            {t('family.ownerBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-text-3">
                        {m.linkedUsername ? t('family.linkedAccount', { username: m.linkedUsername }) : t('family.profileOnly')}
                      </p>
                    </div>
                  )}

                  {isOwner && !isEditing && (
                    <div className="flex items-center gap-1.5">
                      {m.linkedUserId === null && (
                        <Button
                          size="sm"
                          disabled={createInvite.isPending}
                          onClick={() =>
                            createInvite.mutate(m.id, {
                              onSuccess: (inv) => {
                                setLatestInvite(inv);
                                toast.success(t('family.inviteCreated'));
                              },
                            })
                          }
                        >
                          <Link2 aria-hidden />
                          {t('family.invite')}
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        aria-label={t('family.renameMember')}
                        onClick={() => {
                          setEditingMemberId(m.id);
                          setEditingMemberName(m.name);
                        }}
                      >
                        <Pencil />
                      </Button>
                      {m.role !== 'owner' && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-neg hover:text-neg"
                          aria-label={t('family.removeMember')}
                          onClick={() => setConfirmDeleteMember({ id: m.id, name: m.name })}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isOwner && latestInvite?.memberId === m.id && (
                  <div className="rounded-[8px] border border-line bg-card p-3">
                    <p className="mb-1.5 text-[12px] text-text-2">{t('family.inviteLinkHint')}</p>
                    <CopyField value={`${window.location.origin}${latestInvite.path}`} label={t('family.inviteLinkLabel')} />
                  </div>
                )}

                {isOwner && pendingInvite && latestInvite?.id !== pendingInvite.id && (
                  <div className="flex items-center justify-between gap-2 text-[12px] text-text-3">
                    <span>{t('family.pendingInvite')}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        revokeInvite.mutate(pendingInvite.id, {
                          onSuccess: () => toast.success(t('family.inviteRevoked')),
                        })
                      }
                    >
                      {t('family.revokeInvite')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && members.length < MAX_MEMBERS && (
          <form
            className="flex flex-wrap items-end gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!memberName.trim()) return;
              addMember.mutate(
                { name: memberName.trim(), color: memberColor },
                {
                  onSuccess: () => {
                    setMemberName('');
                    setMemberColor(PALETTE[(members.length + 1) % PALETTE.length]!);
                    toast.success(t('family.memberAdded'));
                  },
                },
              );
            }}
          >
            <div className="min-w-[180px] flex-1">
              <Input
                label={t('family.addMemberLabel')}
                placeholder={t('family.addMemberPh')}
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="flex items-center gap-1 pb-2" role="group" aria-label={t('family.memberColor')}>
              {PALETTE.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={memberColor === c}
                  onClick={() => setMemberColor(c)}
                  className={
                    memberColor === c
                      ? 'size-6 rounded-full ring-2 ring-accent ring-offset-2 ring-offset-bg'
                      : 'size-6 rounded-full opacity-75 hover:opacity-100'
                  }
                  style={{ background: c }}
                />
              ))}
            </div>
            <Button type="submit" variant="primary" disabled={!memberName.trim() || addMember.isPending}>
              <UserPlus aria-hidden />
              <Plus className="sr-only" />
              {t('family.addMember')}
            </Button>
          </form>
        )}
      </Section>

      <ConfirmDialog
        open={confirmDeleteFamily}
        onOpenChange={setConfirmDeleteFamily}
        title={t('family.deleteTitle')}
        body={t('family.deleteBody')}
        confirmLabel={t('family.delete')}
        onConfirm={() =>
          deleteFamily.mutate(undefined, {
            onSuccess: () => {
              setLatestInvite(null);
              toast.success(t('family.deleted'));
            },
          })
        }
      />

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t('family.leaveTitle')}
        body={t('family.leaveBody')}
        confirmLabel={t('family.leave')}
        onConfirm={() => leaveFamily.mutate(undefined, { onSuccess: () => toast.success(t('family.left')) })}
      />

      <ConfirmDialog
        open={confirmDeleteMember !== null}
        onOpenChange={(open) => !open && setConfirmDeleteMember(null)}
        title={t('family.removeMemberTitle', { name: confirmDeleteMember?.name ?? '' })}
        body={t('family.removeMemberBody')}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (!confirmDeleteMember) return;
          deleteMember.mutate(confirmDeleteMember.id, {
            onSuccess: () => {
              setConfirmDeleteMember(null);
              toast.success(t('family.memberRemoved'));
            },
          });
        }}
      />
    </div>
  );
}
