// Read-only snapshot inventory. Manual policy annotations are audit interpretations,
// not executable authorization policy or proof that every endpoint was runtime-tested.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const index = fs.readFileSync(path.join(root, 'server/src/index.ts'), 'utf8')
const imports = new Map([...index.matchAll(/import (\w+) from '\.\/routes\/([^']+)\.js'/g)].map(m => [m[1], m[2]]))
// Named import in composition root, if present.
for (const m of index.matchAll(/import \{\s*(\w+)\s*\} from '\.\/routes\/([^']+)\.js'/g)) imports.set(m[1], m[2])
const roles = ['admin', 'chunhiem', 'phuta', 'phuhuynh']
const rows = []
const sourceHashes = {}
for (const mount of index.matchAll(/app\.route\('([^']+)', (\w+)\)/g)) {
  const module = imports.get(mount[2])
  if (!module) throw new Error(`Unresolved mount ${mount[2]}`)
  const file = `server/src/routes/${module}.ts`
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  sourceHashes[file] = createHash('sha256').update(source).digest('hex')
  const endpoints = [...source.matchAll(/^\w+\.(get|post|put|patch|delete)\(\s*'([^']*)'/gm)]
  const routerGate = source.match(/^\w+\.use\('\*', (?:authMiddleware, )?roleMiddleware\(([^)]+)\)/m)?.[1]
  for (let n = 0; n < endpoints.length; n++) {
    const m = endpoints[n], method = m[1].toUpperCase(), local = m[2]
    const body = source.slice(m.index, endpoints[n + 1]?.index ?? source.length)
    const gate = body.match(/roleMiddleware\(([^)]+)\)/)?.[1] ?? routerGate
    let allowed = gate ? roles.filter(role => gate.includes(`'${role}'`)) : [...roles]
    let scope = 'TENANT', publicAccess = 'DENY', tenant = 'JWT parishId; no cross-tenant authority'
    let note = 'Static route/service reconstruction; no per-endpoint runtime completeness claim'
    const resource = module
    if (module === 'auth') {
      scope = 'SELF'
      if (local === '/admin-change-password') { allowed = ['admin']; scope = 'TENANT+ADMIN_REAUTH'; note = 'Protected superadmin target; D4 and D6 exceptions' }
      if (local === '/login') { publicAccess = 'CREDENTIALS'; scope = 'CREDENTIALS'; tenant = 'Body parishId; explicit default gia-ton; DB username+parish'; note = 'D8 enumeration; D6 LOCKED exception' }
      if (local === '/refresh') { publicAccess = 'REFRESH_COOKIE+ORIGIN'; scope = 'REFRESH_COOKIE'; tenant = 'Signed refresh claims + hashed session'; note = 'Rotation/reuse; legacy version gap H1' }
      if (local === '/parent-reset-password') { publicAccess = '410_REMOVED'; scope = '410_REMOVED'; tenant = 'No recovery performed' }
      if (local === '/change-password') note = 'D5 stale verification before transaction; D4 forced-state allowlist'
      if (local === '/profile') note = 'Self fullName/phone; parent phone change prohibited; no role/username update'
    } else if (module === 'health') {
      scope = local === '/health' ? 'PUBLIC_MINIMAL' : 'OPS_TOKEN'
      publicAccess = scope; tenant = 'Infrastructure; no user/tenant records'
    } else if (module === 'cspReport') {
      publicAccess = 'PUBLIC_REPORT_INGEST'; scope = publicAccess; tenant = 'Telemetry only; bounded ingestion'
    } else if (module === 'verification') {
      if (local === '/verify') { publicAccess = 'HMAC_CAPABILITY'; scope = 'SIGNED_STUDENT_IDENTITY'; tenant = 'Signed parish/student/year/cert' }
      else { scope = 'TENANT_STUDENT'; note = 'D10: broad staff signing; arbitrary cert/year tuple; no issuance record or content digest' }
    } else if (module === 'passwordResetRequests') {
      if (local === '/') { publicAccess = 'GENERIC_202'; scope = 'NO_ACCOUNT_DISCLOSURE'; tenant = 'Request parish; generic acknowledgement' }
      else { allowed = ['admin']; scope = local.endsWith('/reset') ? 'TENANT+ADMIN_REAUTH' : 'TENANT'; note = 'Exact /admin and /admin/* gates; ticket+target tenant; atomic pending claim' }
    } else if (module === 'students') {
      scope = method === 'GET' ? 'TENANT_ROSTER' : 'CURRENT_STUDENT_CLASS'
      note = 'GLV parish-wide reads intentional; writes scoped; parent staff endpoint denied'
    } else if (['grades', 'attendance', 'dailyEntries'].includes(module)) {
      scope = 'CURRENT_STUDENT_CLASS'
      note = 'Admin tenant-wide; other roles assignment-filtered; auth-only reads do not separately deny corrupt parent assignments (H4)'
      if (module === 'grades' && method === 'POST' && ['/', '/batch'].includes(local)) note = 'D1: final UPDATE lacks parish predicate for existing grade id+version'
      if (module === 'grades' && local.includes('override')) note = 'Override/restore service reloads role and assignment in transaction; tenant-scoped repository'
      if (local.includes('import')) scope = 'CLASS_AND_IMPORT_SCOPE'
    } else if (module === 'exams') {
      scope = 'SESSION_CLASS_AND_STUDENT_MEMBERSHIP'
      note = 'Admin tenant-wide; GLV assigned; completed/manifest/lock restrictions; auth-only alternate handlers rely on assignment (H3/H4)'
    } else if (module === 'promotion') {
      scope = 'CURRENT_STUDENT_CLASS'; note = 'Server evaluates policy; caller scores do not create authority; target class tenant checked'
    } else if (module === 'reporting') {
      scope = local.startsWith('/report-card') ? 'CLASS_OR_CURRENT_PARENT_CHILD' : local.startsWith('/class-summary') ? 'ASSIGNED_CLASS' : 'CALLER_HTML_ONLY'
      note = 'Read context authorized in tx; parent phone ownership; PDF renderer does not query child data'
    } else if (module === 'parents') {
      scope = local === '/my-children' ? 'CURRENT_PHONE_CHILDREN' : 'RETIRED_CHANNEL_TOMBSTONE'
      note = local === '/my-children'
        ? 'Tenant+current user phone; active student; legacy KBA not authority'
        : 'Authenticated parent-only compatibility endpoint returns 410 without reading or mutating channel state'
    } else if (module === 'leaveRequests') {
      scope = method === 'POST' || method === 'GET' && local === '/' ? 'STAFF_CLASS_OR_PARENT_CHILD' : 'REQUEST_SNAPSHOT_CLASS'
      if (local.endsWith('/review')) { allowed = ['admin', 'chunhiem', 'phuta']; note = 'D2: snapshot class used; attendance writes omit semester lock/current student check' }
      if (local === '/pending-count') { allowed = ['admin', 'chunhiem', 'phuta']; note = 'Parent receives zero rather than access to staff pending data' }
      if (method === 'DELETE') { scope = 'SNAPSHOT_CLASS_OR_PARENT_CREATOR'; note = 'PENDING CAS; parentId ownership (not current child phone); old class authorization D2' }
    } else if (module === 'notifications') {
      scope = 'SELF_SUBSCRIPTION'
      if (local.startsWith('/smart/')) { allowed = ['admin', 'chunhiem']; scope = 'ASSIGNED_CLASS_RECIPIENTS' }
      if (local === '/smart/report-cards') { scope = 'CLASS_CHECK_THEN_CALLER_PHONE'; note = 'D3 authorization identity differs from recipient identity; global fallback H5' }
      if (local === '/smart/reminder/sunday' || local === '/send') { scope = 'TENANT_BROADCAST'; note = 'Sunday manual trigger permits CN parish-wide; /send admin-only' }
      if (local === '/vapid-public-key') scope = 'PUBLIC_KEY_AUTHENTICATED'
    } else if (module === 'feedback') {
      scope = local === '/sent' ? 'SELF_PUBLIC_SUBMISSIONS' : local === '/inbox' || method === 'PATCH' ? 'TENANT_ADMIN_OR_ADDRESSED_CN' : 'TENANT_BOARD_OR_CHILD_HOMEROOM_CN'
      note = 'Anonymous no sender persisted; parent targets resolved from current children; no admin send role'
    } else if (module === 'questionBank') {
      scope = 'TENANT_SHARED_BANK'
      if (method === 'PUT') scope = 'ADMIN_OR_OWN_DRAFT'
      if (local.endsWith('/lifecycle')) { scope = 'OWNER_SUBMIT_ADMIN_REVIEW'; note = 'submit own draft; reject/approve/activate/archive admin only' }
      if (local.endsWith('/status')) { allowed = ['admin']; scope = 'TENANT_BLUEPRINT' }
      if (local === '/exams/build') scope = 'ASSIGNED_CLASS_IN_TRANSACTION'
    } else if (module === 'parishProfile') {
      scope = method === 'GET' ? 'TENANT_STAFF_VISIBILITY' : 'TENANT_REFERENCES'
      note = 'Nonadmin STAFF visibility; published records; download rechecks tenant+visibility; D4 profile suffix'
    } else if (module === 'finances') {
      scope = 'TENANT_FUND_CLASS_STUDENT_RELATION'; note = 'Router admin-only; transaction validates references and student-class membership'
    } else if (module === 'backup') {
      scope = 'TENANT+ADMIN_REAUTH'; note = 'Restore forces row parish and composite IDs; no users/auth sessions restored'
    } else if (module === 'import') {
      scope = /validate|import/.test(local) ? 'ASSIGNED_CLASS' : local === '/history' || local.startsWith('/batch/') ? 'ADMIN_OR_BATCH_OWNER' : local === '/mappings' && method === 'POST' ? 'ASSIGNED_CLASS_OR_STUDENT' : 'TENANT_IMPORT_METADATA'
      note = 'Assigned-class import; undo admin-only; history/detail CN owner-only; same /api/students mount order covered'
    } else if (module === 'classes') {
      scope = method === 'GET' ? 'TENANT_METADATA' : 'TENANT_REFERENCES'
      note = 'Nonadmin class reads strip other teacher assignments; assignment mutation validates eligible staff'
    } else if (module === 'users') {
      scope = local === '/catechists' ? 'TENANT_MINIMIZED_DIRECTORY' : 'TENANT_USER'
      if (/reset-password|phone|provision-parents/.test(local) || method === 'DELETE') scope += '+ADMIN_REAUTH'
      if (local.includes('reveal-password')) { scope = '410_REMOVED'; note = 'No plaintext/reversible reveal endpoint' }
      else note = 'Admin mutation; target+references tenant; D6 superadmin target identity only userId'
    } else if (module === 'notices') {
      scope = method === 'GET' ? 'TENANT_AUDIENCE_FILTER' : 'TENANT_SHARED_NOTICE'; note = 'CN can manage parish-wide notices; no creator ownership policy'
    } else if (module === 'parishEvents') {
      scope = 'TENANT_SHARED_EVENT'; note = 'Admin/CN mutation; no creator ownership restriction'
    } else if (['academicYears', 'semesterLocks', 'settings', 'auditLogs', 'sync', 'system'].includes(module)) {
      scope = module === 'system' && method === 'POST' ? 'ADMIN_REAUTH_ACK_PURGE_TENANT' : 'TENANT'
    } else throw new Error(`Unannotated module ${module}`)
    const cells = Object.fromEntries(roles.map(role => [role, allowed.includes(role) ? scope : 'DENY_ROLE']))
    // Distinguish unrestricted parish admin from the staff assignment requirement.
    if (allowed.includes('admin') && ['CURRENT_STUDENT_CLASS', 'SESSION_CLASS_AND_STUDENT_MEMBERSHIP', 'ASSIGNED_CLASS', 'STAFF_CLASS_OR_PARENT_CHILD', 'REQUEST_SNAPSHOT_CLASS', 'SNAPSHOT_CLASS_OR_PARENT_CREATOR', 'CLASS_OR_CURRENT_PARENT_CHILD', 'ASSIGNED_CLASS_IN_TRANSACTION'].includes(scope)) cells.admin = 'TENANT_OBJECT'
    if (module === 'reporting' && local.startsWith('/report-card')) { cells.phuhuynh = 'CURRENT_PHONE_CHILD'; cells.chunhiem = cells.phuta = 'ASSIGNED_CLASS' }
    if (module === 'leaveRequests' && local === '/' && allowed.includes('phuhuynh')) cells.phuhuynh = 'CURRENT_PHONE_CHILD'
    if (module === 'leaveRequests' && method === 'DELETE') cells.phuhuynh = 'PARENT_CREATOR_PENDING'
    if (module === 'leaveRequests' && local === '/pending-count') cells.phuhuynh = 'CONSTANT_ZERO'
    if (['grades', 'attendance'].includes(module) && method === 'GET' && local === '/') {
      cells.admin = 'TENANT_ACTIVE_STUDENTS'
      cells.chunhiem = cells.phuta = cells.phuhuynh = 'ASSIGNED_STUDENTS_IF_NONEMPTY_ELSE_TENANT_D9'
      scope = 'D9_EMPTY_SCOPE_FAIL_OPEN'
      note = 'D9: empty studentIds skips IN predicate; grade nonadmin semester still applies; updatedAfter can empty an otherwise assigned scope'
    }
    rows.push({ method, endpoint: `${mount[1] === '/' ? '' : mount[1]}${local === '/' ? '' : local}` || '/', resource, ...cells, publicAccess, tenant, object: scope, evidence: `${file}:${source.slice(0, m.index).split('\n').length}`, note })
  }
}
const head = process.argv[2] || 'UNSPECIFIED: pass independently verified HEAD as first argument'
process.stdout.write(JSON.stringify({ head, snapshot: 'Working tree; source hashes below; role cells assume valid current account, except explicit public/capability paths. Read with audit state matrix and defects.', routeModules: new Set(rows.map(row => row.resource)).size, endpointCount: rows.length, sourceHashes, rows }, null, 2))
