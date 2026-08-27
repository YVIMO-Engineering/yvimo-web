import React from "react";
import {
  ArrowLeft,
  CalendarOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  Clock3,
  Repeat2,
  Save,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSupabaseRealtimeRefresh } from "../lib/useSupabaseRealtimeRefresh";
import { MesOrderDatePicker } from "./MesWorkspaces";
import "./staffWorkspace.css";

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
  activeSection: "personnel" | "shifts";
};
type Member = {
  id: string;
  userId: string;
  role: string;
  name: string;
  avatarUrl: string;
  workCenterId: string | null;
};
type WorkCenter = { id: string; code: string; name: string };
type RotationRule = { memberId: string; primaryShift: number; alternateShift: number; intervalWeeks: number; anchorWeek: string; active: boolean };
type Vacation = { id: string; memberId: string; dateFrom: string; dateTo: string; notes: string };

type Shift = {
  id: string;
  shiftNumber: number;
  startTime: string;
  endTime: string;
};
const defaultShiftTimes = [
  { startTime: "06:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "22:00" },
  { startTime: "22:00", endTime: "06:00" },
];
const isoDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const weekStartFor = (value: string | Date) => { const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return isoDate(date); };

function StaffTimePicker({
  value,
  label,
  saving,
  onChange,
  onSave,
}: {
  value: string;
  label: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const controlRef = React.useRef<HTMLDivElement | null>(null);
  const [hours24, minutes] = value.split(":").map(Number);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 || 12;
  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const update = (
    nextHour12: number,
    nextMinutes: number,
    nextPeriod: string,
  ) => {
    const nextHours = (nextHour12 % 12) + (nextPeriod === "PM" ? 12 : 0);
    onChange(
      `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`,
    );
  };
  return (
    <label className="staff-time-field">
      <span>{label}</span>
      <div
        className={`staff-time-picker${open ? " open" : ""}`}
        ref={controlRef}
      >
        <button type="button" onClick={() => setOpen((current) => !current)}>
          <strong>
            {String(hour12).padStart(2, "0")}:{String(minutes).padStart(2, "0")}{" "}
            {period}
          </strong>
          <Clock3 size={15} />
        </button>
        {open ? (
          <div className="staff-time-menu">
            <div className="staff-time-columns">
              <div>
                {Array.from({ length: 12 }, (_, index) => index + 1).map(
                  (hour) => (
                    <button
                      type="button"
                      className={hour === hour12 ? "selected" : ""}
                      onClick={() => update(hour, minutes, period)}
                      key={hour}
                    >
                      {String(hour).padStart(2, "0")}
                    </button>
                  ),
                )}
              </div>
              <div>
                {[0, 15, 30, 45].map((minute) => (
                  <button
                    type="button"
                    className={minute === minutes ? "selected" : ""}
                    onClick={() => update(hour12, minute, period)}
                    key={minute}
                  >
                    {String(minute).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div>
                {["AM", "PM"].map((option) => (
                  <button
                    type="button"
                    className={option === period ? "selected" : ""}
                    onClick={() => update(hour12, minutes, option)}
                    key={option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="staff-time-save"
              type="button"
              disabled={saving}
              onClick={() => {
                onSave();
                setOpen(false);
              }}
            >
              <Save size={15} /> {saving ? "Saving..." : "Save hours"}
            </button>
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function StaffWorkspace({
  organizationId,
  onNavigate,
  activeSection,
}: Props) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [workCenters, setWorkCenters] = React.useState<WorkCenter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingMemberId, setSavingMemberId] = React.useState("");
  const [error, setError] = React.useState("");
  const [selectedWorkCenterId, setSelectedWorkCenterId] = React.useState("");
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [memberShiftIds, setMemberShiftIds] = React.useState<
    Record<string, string>
  >({});
  const [shiftSaving, setShiftSaving] = React.useState("");
  const [selectedWeekStart, setSelectedWeekStart] = React.useState(() => weekStartFor(new Date()));
  const [rotationRules, setRotationRules] = React.useState<Record<string, RotationRule>>({});
  const [vacations, setVacations] = React.useState<Vacation[]>([]);
  const [staffDialog, setStaffDialog] = React.useState<{ type: "rotation" | "vacation"; member: Member } | null>(null);
  const [rotationDraft, setRotationDraft] = React.useState({ alternateShift: 2, intervalWeeks: 2, active: true });
  const [vacationDraft, setVacationDraft] = React.useState({ dateFrom: isoDate(new Date()), dateTo: isoDate(new Date()), notes: "" });

  const load = React.useCallback(async () => {
    setLoading(true);
    const [memberResult, centerResult, assignmentResult] = await Promise.all([
      supabase
        .from("manufacturing_organization_members")
        .select("id, user_id, role, created_at")
        .eq("organization_id", organizationId)
        .order("created_at"),
      supabase
        .from("mes_work_centers")
        .select("id, code, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("aps_staff_work_center_assignments")
        .select("member_id, work_center_id")
        .eq("organization_id", organizationId),
    ]);
    const firstError =
      memberResult.error ?? centerResult.error ?? assignmentResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    const memberRows = memberResult.data ?? [];
    const userIds = memberRows.map((member) => member.user_id);
    const profileResult = userIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds)
      : { data: [], error: null };
    if (profileResult.error) {
      setError(profileResult.error.message);
      setLoading(false);
      return;
    }
    const profileById = new Map(
      (profileResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const assignmentByMember = new Map(
      (assignmentResult.data ?? []).map((assignment) => [
        assignment.member_id,
        assignment.work_center_id,
      ]),
    );
    setWorkCenters((centerResult.data ?? []) as WorkCenter[]);
    setSelectedWorkCenterId(
      (current) => current || centerResult.data?.[0]?.id || "",
    );
    setMembers(
      memberRows.map((member) => {
        const profile = profileById.get(member.user_id);
        return {
          id: member.id,
          userId: member.user_id,
          role: member.role,
          name: profile?.full_name?.trim() || "Organization member",
          avatarUrl: profile?.avatar_url ?? "",
          workCenterId: assignmentByMember.get(member.id) ?? null,
        };
      }),
    );
    setError("");
    setLoading(false);
  }, [organizationId]);

  const loadShifts = React.useCallback(async () => {
    if (!selectedWorkCenterId || activeSection !== "shifts") return;
    const currentWeekStart = weekStartFor(new Date());
    const [shiftResult, assignmentResult] = await Promise.all([
      supabase
        .from("aps_staff_shifts")
        .select("id, shift_number, start_time, end_time")
        .eq("organization_id", organizationId)
        .eq("work_center_id", selectedWorkCenterId)
        .eq("week_start", selectedWeekStart)
        .order("shift_number"),
      supabase
        .from("aps_staff_shift_assignments")
        .select("member_id, shift_id")
        .eq("organization_id", organizationId)
        .eq("week_start", selectedWeekStart),
    ]);
    if (shiftResult.error || assignmentResult.error) {
      setError(
        shiftResult.error?.message ??
          assignmentResult.error?.message ??
          "Unable to load shifts.",
      );
      return;
    }
    let existing = shiftResult.data ?? [];
    if (existing.length < 3) {
      const templateResult = selectedWeekStart !== currentWeekStart ? await supabase.from("aps_staff_shifts").select("id, shift_number, start_time, end_time").eq("organization_id", organizationId).eq("work_center_id", selectedWorkCenterId).eq("week_start", currentWeekStart).order("shift_number") : { data: [], error: null };
      if (templateResult.error) { setError(templateResult.error.message); return; }
      const templateShifts = templateResult.data ?? [];
      const missingShifts = [1, 2, 3].filter(
        (shiftNumber) =>
          !existing.some((shift) => shift.shift_number === shiftNumber),
      );
      const createResult = await supabase
        .from("aps_staff_shifts")
        .upsert(
          missingShifts.map((shiftNumber) => ({
            organization_id: organizationId,
            work_center_id: selectedWorkCenterId,
            week_start: selectedWeekStart,
            shift_number: shiftNumber,
            start_time: templateShifts.find((shift) => shift.shift_number === shiftNumber)?.start_time ?? defaultShiftTimes[shiftNumber - 1].startTime,
            end_time: templateShifts.find((shift) => shift.shift_number === shiftNumber)?.end_time ?? defaultShiftTimes[shiftNumber - 1].endTime,
          })),
          { onConflict: "organization_id,work_center_id,week_start,shift_number" },
        )
        .select("id, shift_number, start_time, end_time");
      if (createResult.error) {
        setError(createResult.error.message);
        return;
      }
      existing = [...existing, ...(createResult.data ?? [])];
      if (selectedWeekStart !== currentWeekStart && templateShifts.length) {
        const templateAssignmentResult = await supabase.from("aps_staff_shift_assignments").select("member_id, shift_id").eq("organization_id", organizationId).eq("week_start", currentWeekStart).in("shift_id", templateShifts.map((shift) => shift.id));
        if (templateAssignmentResult.error) { setError(templateAssignmentResult.error.message); return; }
        const targetShiftByNumber = new Map(existing.map((shift) => [shift.shift_number, shift.id]));
        const templateNumberById = new Map(templateShifts.map((shift) => [shift.id, shift.shift_number]));
        const copiedAssignments = (templateAssignmentResult.data ?? []).map((assignment) => ({ organization_id: organizationId, member_id: assignment.member_id, week_start: selectedWeekStart, shift_id: targetShiftByNumber.get(templateNumberById.get(assignment.shift_id) ?? 0) })).filter((assignment) => Boolean(assignment.shift_id));
        if (copiedAssignments.length) await supabase.from("aps_staff_shift_assignments").upsert(copiedAssignments, { onConflict: "organization_id,member_id,week_start" });
        const refreshedAssignments = await supabase.from("aps_staff_shift_assignments").select("member_id, shift_id").eq("organization_id", organizationId).eq("week_start", selectedWeekStart);
        if (!refreshedAssignments.error) assignmentResult.data = refreshedAssignments.data;
      }
    }
    const nextShifts = [1, 2, 3].map((shiftNumber) => {
      const row = existing.find((shift) => shift.shift_number === shiftNumber);
      const fallback = defaultShiftTimes[shiftNumber - 1];
      return {
        id: row?.id ?? "",
        shiftNumber,
        startTime: row?.start_time?.slice(0, 5) ?? fallback.startTime,
        endTime: row?.end_time?.slice(0, 5) ?? fallback.endTime,
      };
    });
    setShifts(nextShifts);
    setMemberShiftIds(
      Object.fromEntries(
        (assignmentResult.data ?? []).map((assignment) => [
          assignment.member_id,
          assignment.shift_id,
        ]),
      ),
    );
  }, [activeSection, organizationId, selectedWeekStart, selectedWorkCenterId]);

  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    void loadShifts();
  }, [loadShifts]);
  React.useEffect(() => {
    if (activeSection !== "shifts") return;
    void Promise.all([
      supabase.from("aps_staff_shift_rotations").select("member_id, primary_shift_number, alternate_shift_number, interval_weeks, anchor_week, active").eq("organization_id", organizationId),
      supabase.from("aps_staff_vacations").select("id, member_id, date_from, date_to, notes").eq("organization_id", organizationId),
    ]).then(([rotationResult, vacationResult]) => {
      if (rotationResult.error || vacationResult.error) { setError(rotationResult.error?.message ?? vacationResult.error?.message ?? "Unable to load staff availability."); return; }
      setRotationRules(Object.fromEntries((rotationResult.data ?? []).map((rule) => [rule.member_id, { memberId: rule.member_id, primaryShift: rule.primary_shift_number, alternateShift: rule.alternate_shift_number, intervalWeeks: rule.interval_weeks, anchorWeek: rule.anchor_week, active: rule.active }])));
      setVacations((vacationResult.data ?? []).map((vacation) => ({ id: vacation.id, memberId: vacation.member_id, dateFrom: vacation.date_from, dateTo: vacation.date_to, notes: vacation.notes })));
    });
  }, [activeSection, organizationId]);
  useSupabaseRealtimeRefresh({
    channelName: `aps-staff-${organizationId}`,
    tables: React.useMemo(
      () => [
        {
          table: "manufacturing_organization_members",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          table: "mes_work_centers",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          table: "aps_staff_work_center_assignments",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          table: "aps_staff_shifts",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          table: "aps_staff_shift_assignments",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      [organizationId],
    ),
    onRefresh: () => {
      void load();
      void loadShifts();
    },
  });

  const columns = [
    { id: null, code: "UNASSIGNED", name: "Not Assigned" },
    ...workCenters,
  ];
  const moveMember = async (member: Member, direction: -1 | 1) => {
    const currentIndex = Math.max(
      0,
      columns.findIndex((column) => column.id === member.workCenterId),
    );
    const nextColumn = columns[currentIndex + direction];
    if (!nextColumn) return;
    setSavingMemberId(member.id);
    setMembers((current) =>
      current.map((item) =>
        item.id === member.id ? { ...item, workCenterId: nextColumn.id } : item,
      ),
    );
    const { error: saveError } = await supabase
      .from("aps_staff_work_center_assignments")
      .upsert(
        {
          organization_id: organizationId,
          member_id: member.id,
          work_center_id: nextColumn.id,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        },
        { onConflict: "organization_id,member_id" },
      );
    if (saveError) {
      setError(saveError.message);
      await load();
    }
    setSavingMemberId("");
  };

  const saveShift = async (shift: Shift) => {
    if (!selectedWorkCenterId) return;
    setShiftSaving(`shift-${shift.shiftNumber}`);
    const { data, error: saveError } = await supabase
      .from("aps_staff_shifts")
      .upsert(
        {
          organization_id: organizationId,
          work_center_id: selectedWorkCenterId,
          week_start: selectedWeekStart,
          shift_number: shift.shiftNumber,
          start_time: shift.startTime,
          end_time: shift.endTime,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        },
        { onConflict: "organization_id,work_center_id,week_start,shift_number" },
      )
      .select("id")
      .single();
    if (saveError) setError(saveError.message);
    else
      setShifts((current) =>
        current.map((item) =>
          item.shiftNumber === shift.shiftNumber
            ? { ...item, id: data.id }
            : item,
        ),
      );
    setShiftSaving("");
  };
  const ensurePersistedShifts = async () => {
    for (const shift of shifts) if (!shift.id) await saveShift(shift);
    const { data } = await supabase
      .from("aps_staff_shifts")
      .select("id, shift_number, start_time, end_time")
      .eq("organization_id", organizationId)
      .eq("work_center_id", selectedWorkCenterId)
      .eq("week_start", selectedWeekStart)
      .order("shift_number");
    const persisted = (data ?? []).map((row) => ({
      id: row.id,
      shiftNumber: row.shift_number,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
    }));
    setShifts(persisted);
    return persisted;
  };
  const moveMemberShift = async (member: Member, targetIndex: number) => {
    setShiftSaving(member.id);
    const persisted = shifts.every((shift) => shift.id)
      ? shifts
      : await ensurePersistedShifts();
    const target = persisted[targetIndex];
    if (!target) {
      setShiftSaving("");
      return;
    }
    setMemberShiftIds((current) => ({ ...current, [member.id]: target.id }));
    const { error: saveError } = await supabase
      .from("aps_staff_shift_assignments")
      .upsert(
        {
          organization_id: organizationId,
          member_id: member.id,
          week_start: selectedWeekStart,
          shift_id: target.id,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        },
        { onConflict: "organization_id,member_id,week_start" },
      );
    if (saveError) {
      setError(saveError.message);
      await loadShifts();
    }
    setShiftSaving("");
  };
  const selectedWeekEnd = new Date(`${selectedWeekStart}T12:00:00`);
  selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 6);
  const selectedWeekLabel = `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${selectedWeekStart}T12:00:00`))} — ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(selectedWeekEnd)}`;
  const moveWeek = (offset: number) => { const date = new Date(`${selectedWeekStart}T12:00:00`); date.setDate(date.getDate() + offset * 7); setSelectedWeekStart(isoDate(date)); };
  const effectiveShiftNumber = (member: Member, fallbackShift: number) => {
    const rule = rotationRules[member.id];
    if (!rule?.active || selectedWeekStart < rule.anchorWeek) return fallbackShift;
    const elapsedWeeks = Math.floor((new Date(`${selectedWeekStart}T12:00:00`).getTime() - new Date(`${rule.anchorWeek}T12:00:00`).getTime()) / 604_800_000);
    return Math.floor(elapsedWeeks / rule.intervalWeeks) % 2 === 0 ? rule.primaryShift : rule.alternateShift;
  };
  const memberVacation = (memberId: string) => vacations.find((vacation) => vacation.memberId === memberId && vacation.dateFrom <= isoDate(selectedWeekEnd) && vacation.dateTo >= selectedWeekStart);
  const openRotationDialog = (member: Member, currentShift: number) => { const rule = rotationRules[member.id]; setRotationDraft({ alternateShift: rule?.alternateShift ?? (currentShift === 1 ? 2 : 1), intervalWeeks: rule?.intervalWeeks ?? 2, active: rule?.active ?? true }); setStaffDialog({ type: "rotation", member }); };
  const saveRotation = async () => {
    if (!staffDialog || staffDialog.type !== "rotation") return;
    const member = staffDialog.member; const assignedShiftId = memberShiftIds[member.id]; const primaryShift = shifts.find((shift) => shift.id === assignedShiftId)?.shiftNumber ?? 1;
    const { error: saveError } = await supabase.from("aps_staff_shift_rotations").upsert({ organization_id: organizationId, member_id: member.id, work_center_id: selectedWorkCenterId, primary_shift_number: primaryShift, alternate_shift_number: rotationDraft.alternateShift, interval_weeks: rotationDraft.intervalWeeks, anchor_week: selectedWeekStart, active: rotationDraft.active, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null }, { onConflict: "organization_id,member_id" });
    if (saveError) setError(saveError.message); else setRotationRules((current) => ({ ...current, [member.id]: { memberId: member.id, primaryShift, alternateShift: rotationDraft.alternateShift, intervalWeeks: rotationDraft.intervalWeeks, anchorWeek: selectedWeekStart, active: rotationDraft.active } })); setStaffDialog(null);
  };
  const openVacationDialog = (member: Member) => { setVacationDraft({ dateFrom: selectedWeekStart, dateTo: isoDate(selectedWeekEnd), notes: "" }); setStaffDialog({ type: "vacation", member }); };
  const saveVacation = async () => {
    if (!staffDialog || staffDialog.type !== "vacation") return;
    const { data, error: saveError } = await supabase.from("aps_staff_vacations").insert({ organization_id: organizationId, member_id: staffDialog.member.id, date_from: vacationDraft.dateFrom, date_to: vacationDraft.dateTo, notes: vacationDraft.notes, created_by: (await supabase.auth.getUser()).data.user?.id ?? null }).select("id").single();
    if (saveError) setError(saveError.message); else setVacations((current) => [...current, { id: data.id, memberId: staffDialog.member.id, dateFrom: vacationDraft.dateFrom, dateTo: vacationDraft.dateTo, notes: vacationDraft.notes }]); setStaffDialog(null);
  };

  return (
    <section className="mes-workspace-panel staff-workspace">
      <header className="mes-screen-header staff-header">
        <button
          className="academy-back-button engineering-back-button mes-workspace-back"
          type="button"
          onClick={() => onNavigate("/workspace/manufacturing-ops/aps")}
        >
          <ArrowLeft size={16} /> APS Applications
        </button>
        <div className="mes-workspace-heading">
          <p className="eyebrow">APS / STAFF</p>
          <h2>Staff</h2>
          <p>
            Assign organization personnel to work centers and keep labor
            ownership visible across the operation.
          </p>
        </div>
        <div aria-hidden="true" />
      </header>
      <main className="staff-content">
        {activeSection === "personnel" ? (
          <>
            <div className="staff-content-heading">
              <span>
                <CircleUserRound size={22} />
              </span>
              <div>
                <p className="eyebrow">STAFF / PERSONNEL</p>
                <h3>Personnel assignments</h3>
                <p>
                  Move each organization member into the work center where they
                  currently belong.
                </p>
              </div>
            </div>
            {error ? <div className="staff-message error">{error}</div> : null}
            <div
              className="staff-board"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(245px, 1fr))`,
              }}
            >
              {columns.map((column, columnIndex) => {
                const columnMembers = members.filter(
                  (member) => member.workCenterId === column.id,
                );
                return (
                  <section
                    className={`staff-column${column.id === null ? " unassigned" : ""}`}
                    key={column.id ?? "unassigned"}
                  >
                    <header>
                      <span>
                        {column.id === null ? (
                          <CircleUserRound size={18} />
                        ) : (
                          <Wrench size={18} />
                        )}
                      </span>
                      <div>
                        <strong>{column.name}</strong>
                        <small>
                          {column.id === null
                            ? "Awaiting assignment"
                            : column.code}
                        </small>
                      </div>
                      <b>{columnMembers.length}</b>
                    </header>
                    <div>
                      {loading ? (
                        <div className="staff-empty">Loading personnel...</div>
                      ) : (
                        columnMembers.map((member) => (
                          <article
                            className="staff-member-card"
                            key={member.id}
                          >
                            <span className="staff-member-avatar">
                              {member.avatarUrl ? (
                                <img src={member.avatarUrl} alt="" />
                              ) : (
                                member.name.slice(0, 1).toUpperCase()
                              )}
                            </span>
                            <div>
                              <strong>{member.name}</strong>
                              <small>{member.role}</small>
                            </div>
                            <nav aria-label={`Move ${member.name}`}>
                              <button
                                type="button"
                                disabled={
                                  columnIndex === 0 ||
                                  savingMemberId === member.id
                                }
                                onClick={() => void moveMember(member, -1)}
                                aria-label={`Move ${member.name} to previous column`}
                              >
                                <ChevronLeft size={16} />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  columnIndex === columns.length - 1 ||
                                  savingMemberId === member.id
                                }
                                onClick={() => void moveMember(member, 1)}
                                aria-label={`Move ${member.name} to next column`}
                              >
                                <ChevronRight size={16} />
                              </button>
                            </nav>
                          </article>
                        ))
                      )}
                      {!loading && !columnMembers.length ? (
                        <div className="staff-empty">
                          No personnel in this column.
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="staff-content-heading">
              <span>
                <Clock3 size={22} />
              </span>
              <div>
                <p className="eyebrow">STAFF / SHIFTS</p>
                <h3>Shift assignments</h3>
                <p>
                  Configure three shifts and distribute work center personnel
                  between them.
                </p>
              </div>
            </div>
            {error ? <div className="staff-message error">{error}</div> : null}
            <section className="staff-shift-filter">
              <label className="staff-work-center-filter">
                <span>Work center</span>
                <select
                  value={selectedWorkCenterId}
                  onChange={(event) =>
                    setSelectedWorkCenterId(event.target.value)
                  }
                >
                  {workCenters.map((center) => (
                    <option value={center.id} key={center.id}>
                      {center.name} · {center.code}
                    </option>
                  ))}
                </select>
              </label>
              <div className="staff-week-filter"><label><span>Week containing</span><MesOrderDatePicker id="staff-shift-week" value={selectedWeekStart} onChange={(value) => setSelectedWeekStart(weekStartFor(value))} /></label><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={17} /></button><strong>{selectedWeekLabel}</strong><button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><ChevronRight size={17} /></button><button className={`staff-this-week${selectedWeekStart === weekStartFor(new Date()) ? " active" : ""}`} type="button" aria-pressed={selectedWeekStart === weekStartFor(new Date())} onClick={() => setSelectedWeekStart(weekStartFor(new Date()))}>This Week</button></div>
            </section>
            <div className="staff-shift-list">
              {shifts.map((shift, shiftIndex) => {
                const workCenterMembers = members.filter(
                  (member) => member.workCenterId === selectedWorkCenterId,
                );
                const shiftMembers = workCenterMembers.filter(
                  (member) => {
                    const baseShift = shifts.find((candidate) => candidate.id === memberShiftIds[member.id])?.shiftNumber ?? 1;
                    return effectiveShiftNumber(member, baseShift) === shift.shiftNumber;
                  },
                );
                return (
                  <section className="staff-shift-row" key={shift.shiftNumber}>
                    <header>
                      <span>
                        <Clock3 size={19} />
                      </span>
                      <div>
                        <strong>Shift {shift.shiftNumber}</strong>
                        <small>
                          {shiftMembers.length}{" "}
                          {shiftMembers.length === 1 ? "member" : "members"}
                        </small>
                      </div>
                      <div className="staff-shift-time">
                        <StaffTimePicker
                          label="From"
                          value={shift.startTime}
                          saving={shiftSaving === `shift-${shift.shiftNumber}`}
                          onChange={(value) => setShifts((current) => current.map((item) => item.shiftNumber === shift.shiftNumber ? { ...item, startTime: value } : item))}
                          onSave={() => void saveShift(shift)}
                        />
                        <span>to</span>
                        <StaffTimePicker
                          label="To"
                          value={shift.endTime}
                          saving={shiftSaving === `shift-${shift.shiftNumber}`}
                          onChange={(value) => setShifts((current) => current.map((item) => item.shiftNumber === shift.shiftNumber ? { ...item, endTime: value } : item))}
                          onSave={() => void saveShift(shift)}
                        />
                      </div>
                    </header>
                    <div className="staff-shift-members">
                      {shiftMembers.map((member) => { const vacation = memberVacation(member.id); return (
                        <article className={`staff-member-card${vacation ? " on-vacation" : ""}`} key={member.id}>
                          <span className="staff-member-avatar">
                            {member.avatarUrl ? (
                              <img src={member.avatarUrl} alt="" />
                            ) : (
                              member.name.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <div>
                            <strong>{member.name}</strong>
                            <small>{vacation ? "On vacation" : member.role}</small>
                          </div>
                          <div className="staff-member-controls"><nav className="staff-member-actions" aria-label={`Scheduling options for ${member.name}`}><button type="button" className={rotationRules[member.id]?.active ? "configured" : ""} onClick={() => openRotationDialog(member, shift.shiftNumber)} title="Rotate shifts"><Repeat2 size={15} /></button><button type="button" className={vacation ? "configured vacation" : ""} onClick={() => openVacationDialog(member)} title="Schedule vacation"><CalendarOff size={15} /></button></nav>
                          <nav
                            className="staff-member-move"
                            aria-label={`Move ${member.name} between shifts`}
                          >
                            <button
                              type="button"
                              disabled={
                                Boolean(vacation) || shiftIndex === 0 || shiftSaving === member.id
                              }
                              onClick={() =>
                                void moveMemberShift(member, shiftIndex - 1)
                              }
                              aria-label={`Move ${member.name} to previous shift`}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              disabled={
                                Boolean(vacation) || shiftIndex === shifts.length - 1 ||
                                shiftSaving === member.id
                              }
                              onClick={() =>
                                void moveMemberShift(member, shiftIndex + 1)
                              }
                              aria-label={`Move ${member.name} to next shift`}
                            >
                              <ChevronDown size={16} />
                            </button>
                          </nav>
                          </div>
                        </article>
                      ); })}
                      {!shiftMembers.length ? (
                        <div className="staff-empty">
                          No personnel assigned to this shift.
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}
              {selectedWorkCenterId &&
              !members.some(
                (member) => member.workCenterId === selectedWorkCenterId,
              ) ? (
                <div className="staff-empty staff-shifts-empty">
                  Assign personnel to this work center from the Personnel
                  section first.
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>
      {staffDialog ? <div className="staff-dialog-backdrop" role="presentation" onMouseDown={() => setStaffDialog(null)}><section className="staff-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="staff-dialog-close" type="button" onClick={() => setStaffDialog(null)}><X size={17} /></button><header><span>{staffDialog.type === "rotation" ? <Repeat2 size={21} /> : <CalendarOff size={21} />}</span><div><small>{staffDialog.member.name}</small><h3>{staffDialog.type === "rotation" ? "Rotate shifts" : "Schedule vacation"}</h3></div></header>{staffDialog.type === "rotation" ? <div className="staff-dialog-form"><label><span>Alternate shift</span><select value={rotationDraft.alternateShift} onChange={(event) => setRotationDraft((current) => ({ ...current, alternateShift: Number(event.target.value) }))}>{shifts.map((shift) => <option value={shift.shiftNumber} key={shift.shiftNumber}>Shift {shift.shiftNumber}</option>)}</select></label><label><span>Change every</span><select value={rotationDraft.intervalWeeks} onChange={(event) => setRotationDraft((current) => ({ ...current, intervalWeeks: Number(event.target.value) }))}>{[1,2,3,4,6,8].map((weeks) => <option value={weeks} key={weeks}>{weeks} {weeks === 1 ? "week" : "weeks"}</option>)}</select></label><label className="staff-dialog-check"><input type="checkbox" checked={rotationDraft.active} onChange={(event) => setRotationDraft((current) => ({ ...current, active: event.target.checked }))} /><span>Rotation active</span></label><p>The member alternates between the current shift and the selected shift, starting this week.</p><button type="button" onClick={() => void saveRotation()}><Save size={15} /> Save rotation</button></div> : <div className="staff-dialog-form"><label><span>From</span><MesOrderDatePicker id="staff-vacation-from" value={vacationDraft.dateFrom} onChange={(value) => setVacationDraft((current) => ({ ...current, dateFrom: value, dateTo: value > current.dateTo ? value : current.dateTo }))} /></label><label><span>To</span><MesOrderDatePicker id="staff-vacation-to" value={vacationDraft.dateTo} onChange={(value) => setVacationDraft((current) => ({ ...current, dateTo: value, dateFrom: value < current.dateFrom ? value : current.dateFrom }))} /></label><label className="staff-dialog-wide"><span>Notes</span><input value={vacationDraft.notes} onChange={(event) => setVacationDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional vacation note" /></label><button type="button" onClick={() => void saveVacation()}><CalendarOff size={15} /> Save vacation</button></div>}</section></div> : null}
    </section>
  );
}
