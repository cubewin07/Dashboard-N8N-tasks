import type { ConfigChange, Employee, OrgConfig } from '@/domain/config'
import { applyConfigChange, pickEditable } from '@/domain/configChange'
import { emitSimEvent, getPrimaryOwnerEmployeeId, type SimBrainContext } from './context'

/** JSON with sorted keys, so two structurally equal values give the same string. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * The editable parts of a config as one comparable string. Stamps the sim and the ConfigSource
 * each put on a hire or a leave (`archivedAt`, `createdAt`) are left out, and employees are
 * sorted by id, so the ConfigSource's echo of a change the sim already made compares equal.
 */
export function configFingerprint(config: OrgConfig): string {
  const editable = pickEditable(config)
  return stableStringify({
    ...editable,
    employees: editable.employees
      .map((e) => ({ ...e, archivedAt: undefined, createdAt: undefined }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  })
}

function isActive(e: Employee): boolean {
  return e.state === 'active'
}

/**
 * The ConfigSource now holds `next` (OfficeFeed.reconfigure). Adopt it by emitting events:
 *  - `config.changed` for everything that differs except who is active (departments, roles,
 *    rules, policy, edits to a person who stays), first, so a new department exists before
 *    its people arrive;
 *  - `staff.archived` for each person who stops being active (their running work goes back to
 *    the queue in the reducer);
 *  - `staff.hired` for each person who starts being active (new, or restored).
 * Nothing differs, nothing is emitted: this is the echo of a change the sim already made.
 */
export function reconfigureBrain(
  ctx: SimBrainContext,
  next: OrgConfig,
  change: ConfigChange | null,
): void {
  const cur = ctx.state.config
  const curById = new Map(cur.employees.map((e) => [e.id, e]))
  const nextById = new Map(next.employees.map((e) => [e.id, e]))

  const hired = next.employees.filter((e) => isActive(e) && !(curById.get(e.id) && isActive(curById.get(e.id)!)))
  const archived = cur.employees.filter((e) => isActive(e) && !(nextById.get(e.id) && isActive(nextById.get(e.id)!)))
  const hiredIds = new Set(hired.map((e) => e.id))
  const archivedIds = new Set(archived.map((e) => e.id))

  // `next` with the arrivals and leavers left as they are now: staff events move those.
  const employees: Employee[] = []
  for (const e of next.employees) {
    if (hiredIds.has(e.id)) {
      const old = curById.get(e.id)
      if (old) employees.push(old)
    } else if (archivedIds.has(e.id)) {
      employees.push(curById.get(e.id)!)
    } else {
      employees.push(e)
    }
  }
  for (const e of archived) {
    if (!nextById.has(e.id)) employees.push(e)
  }
  const settled: OrgConfig = { ...cur, ...pickEditable({ ...next, employees }) }

  const ownerId = getPrimaryOwnerEmployeeId(ctx)

  if (configFingerprint(settled) !== configFingerprint(cur)) {
    // Keep a precise change when the caller's one explains the difference (nicer in the log).
    const explained =
      change !== null &&
      change.kind !== 'config.replace' &&
      configFingerprint(applyConfigChange(cur, change, ctx.clock.now())) ===
        configFingerprint(settled)
    emitSimEvent(
      ctx,
      'config.changed',
      { change: explained && change ? change : { kind: 'config.replace', config: settled } },
      { actor: ownerId },
    )
  }

  for (const e of archived) {
    const reason =
      change?.kind === 'employee.archive' && change.id === e.id
        ? change.reason
        : 'dismissed'
    emitSimEvent(ctx, 'staff.archived', { employeeId: e.id, reason }, { actor: ownerId })
  }
  for (const e of hired) {
    emitSimEvent(ctx, 'staff.hired', { employee: e }, { actor: ownerId })
  }

  // A lower cap starts archiving idle temps as they become eligible (stepStaffing).
  if (next.policy.staffing.tempCap < cur.policy.staffing.tempCap) {
    ctx.enforceTempCap = true
  }

  // Per-department bookkeeping for departments that are gone or switched off.
  const live = new Set(next.departments.filter((d) => d.active).map((d) => d.id))
  for (const id of [...ctx.deptOverloadSinceSimMs.keys()]) {
    if (!live.has(id)) ctx.deptOverloadSinceSimMs.delete(id)
  }
  for (const id of [...ctx.genericGenerators.keys()]) {
    if (!live.has(id)) ctx.genericGenerators.delete(id)
  }
}
