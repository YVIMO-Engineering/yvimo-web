import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleUserRound, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import './staffWorkspace.css';

type Props = { organizationId: string; onNavigate: (path: string) => void };
type Member = { id: string; userId: string; role: string; name: string; avatarUrl: string; workCenterId: string | null };
type WorkCenter = { id: string; code: string; name: string };

export function StaffWorkspace({ organizationId, onNavigate }: Props) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [workCenters, setWorkCenters] = React.useState<WorkCenter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingMemberId, setSavingMemberId] = React.useState('');
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    const [memberResult, centerResult, assignmentResult] = await Promise.all([
      supabase.from('manufacturing_organization_members').select('id, user_id, role, created_at').eq('organization_id', organizationId).order('created_at'),
      supabase.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name'),
      supabase.from('aps_staff_work_center_assignments').select('member_id, work_center_id').eq('organization_id', organizationId),
    ]);
    const firstError = memberResult.error ?? centerResult.error ?? assignmentResult.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }
    const memberRows = memberResult.data ?? [];
    const userIds = memberRows.map((member) => member.user_id);
    const profileResult = userIds.length ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds) : { data: [], error: null };
    if (profileResult.error) { setError(profileResult.error.message); setLoading(false); return; }
    const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
    const assignmentByMember = new Map((assignmentResult.data ?? []).map((assignment) => [assignment.member_id, assignment.work_center_id]));
    setWorkCenters((centerResult.data ?? []) as WorkCenter[]);
    setMembers(memberRows.map((member) => { const profile = profileById.get(member.user_id); return { id: member.id, userId: member.user_id, role: member.role, name: profile?.full_name?.trim() || 'Organization member', avatarUrl: profile?.avatar_url ?? '', workCenterId: assignmentByMember.get(member.id) ?? null }; }));
    setError('');
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void load(); }, [load]);
  useSupabaseRealtimeRefresh({ channelName: `aps-staff-${organizationId}`, tables: React.useMemo(() => [{ table: 'manufacturing_organization_members', filter: `organization_id=eq.${organizationId}` }, { table: 'mes_work_centers', filter: `organization_id=eq.${organizationId}` }, { table: 'aps_staff_work_center_assignments', filter: `organization_id=eq.${organizationId}` }], [organizationId]), onRefresh: () => void load() });

  const columns = [{ id: null, code: 'UNASSIGNED', name: 'Not Assigned' }, ...workCenters];
  const moveMember = async (member: Member, direction: -1 | 1) => {
    const currentIndex = Math.max(0, columns.findIndex((column) => column.id === member.workCenterId));
    const nextColumn = columns[currentIndex + direction];
    if (!nextColumn) return;
    setSavingMemberId(member.id);
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, workCenterId: nextColumn.id } : item));
    const { error: saveError } = await supabase.from('aps_staff_work_center_assignments').upsert({ organization_id: organizationId, member_id: member.id, work_center_id: nextColumn.id, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null }, { onConflict: 'organization_id,member_id' });
    if (saveError) { setError(saveError.message); await load(); }
    setSavingMemberId('');
  };

  return <section className="mes-workspace-panel staff-workspace">
    <header className="mes-screen-header staff-header"><button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/aps')}><ArrowLeft size={16} /> APS Applications</button><div className="mes-workspace-heading"><p className="eyebrow">APS / STAFF</p><h2>Staff</h2><p>Assign organization personnel to work centers and keep labor ownership visible across the operation.</p></div><div aria-hidden="true" /></header>
      <main className="staff-content"><div className="staff-content-heading"><span><CircleUserRound size={22} /></span><div><p className="eyebrow">STAFF / PERSONNEL</p><h3>Personnel assignments</h3><p>Move each organization member into the work center where they currently belong.</p></div></div>{error ? <div className="staff-message error">{error}</div> : null}
        <div className="staff-board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(245px, 1fr))` }}>{columns.map((column, columnIndex) => { const columnMembers = members.filter((member) => member.workCenterId === column.id); return <section className={`staff-column${column.id === null ? ' unassigned' : ''}`} key={column.id ?? 'unassigned'}><header><span>{column.id === null ? <CircleUserRound size={18} /> : <Wrench size={18} />}</span><div><strong>{column.name}</strong><small>{column.id === null ? 'Awaiting assignment' : column.code}</small></div><b>{columnMembers.length}</b></header><div>{loading ? <div className="staff-empty">Loading personnel...</div> : columnMembers.map((member) => <article className="staff-member-card" key={member.id}><span className="staff-member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.role}</small></div><nav aria-label={`Move ${member.name}`}><button type="button" disabled={columnIndex === 0 || savingMemberId === member.id} onClick={() => void moveMember(member, -1)} aria-label={`Move ${member.name} to previous column`}><ChevronLeft size={16} /></button><button type="button" disabled={columnIndex === columns.length - 1 || savingMemberId === member.id} onClick={() => void moveMember(member, 1)} aria-label={`Move ${member.name} to next column`}><ChevronRight size={16} /></button></nav></article>)}{!loading && !columnMembers.length ? <div className="staff-empty">No personnel in this column.</div> : null}</div></section>; })}</div>
      </main>
  </section>;
}
