import { create } from 'zustand'
import { MOCK_NOTICES } from '../data/mockParishData'
import type { ParishNotice } from '../types'

interface NoticeState {
  notices: ParishNotice[]
}

export const useNoticeStore = create<NoticeState>(() => ({
  notices: MOCK_NOTICES,
}))
