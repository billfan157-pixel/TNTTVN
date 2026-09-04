// Phase 3: barrel tương thích — transport ở ./api/core, domains ở ./api/*.
// Mọi caller (stores/hooks/components/tests) giữ nguyên `import { api, ... }
// from '../lib/api'`. Domain modules chỉ import từ './core' (sibling), KHÔNG
// từ barrel → không chu kỳ import (xem A-NEW-27 trong core.ts).
export {
  API_BASE,
  ApiError,
  BACKEND_UNAVAILABLE_MESSAGE,
  isBackendUnavailableResponse,
  httpFetch,
  request,
  getAccessToken,
  setTokens,
  loadTokensFromStorage,
  loadTokens,
  clearTokens,
  isAuthenticated,
  setNavigateToLogin,
  bootstrapAccessToken,
  newIdempotencyKey,
  refreshAccessToken,
  withDeadline,
} from './api/core'
export type { QuestionBankMutationInput } from './api/questionBank'

import { authApi } from './api/auth'
import { pushApi } from './api/push'
import { parentsApi } from './api/parents'
import { feedbackApi } from './api/feedback'
import { leaveRequestsApi } from './api/leaveRequests'
import { questionBankApi } from './api/questionBank'
import { examsApi } from './api/exams'
import { dailyEntriesApi } from './api/dailyEntries'
import { settingsApi } from './api/settings'
import { usersApi } from './api/users'
import { studentsApi } from './api/students'
import { gradesApi } from './api/grades'
import { mappingApi } from './api/mapping'
import { attendanceLegacyApi } from './api/attendanceLegacy'
import { classesApi } from './api/classes'
import { noticesApi } from './api/notices'
import { notificationsApi } from './api/notifications'
import { auditLogsApi } from './api/auditLogs'
import { systemApi } from './api/system'
import { reportsApi } from './api/reports'
import { parishEventsApi } from './api/parishEvents'
import { financesApi } from './api/finances'
import { parishProfileApi } from './api/parishProfile'
import { syncApi } from './api/sync'

export const api = {
  ...authApi,
  ...pushApi,
  ...parentsApi,
  ...feedbackApi,
  ...leaveRequestsApi,
  ...questionBankApi,
  ...examsApi,
  ...dailyEntriesApi,
  ...settingsApi,
  ...usersApi,
  ...studentsApi,
  ...gradesApi,
  ...mappingApi,
  ...attendanceLegacyApi,
  ...classesApi,
  ...noticesApi,
  ...notificationsApi,
  ...auditLogsApi,
  ...systemApi,
  ...reportsApi,
  ...parishEventsApi,
  // Nested namespaces giữ nguyên shape cũ (không spread):
  finances: financesApi,
  parishProfile: parishProfileApi,
  ...syncApi,
}
