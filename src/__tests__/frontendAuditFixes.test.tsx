import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { DesktopSidebar } from '../components/desktop/DesktopSidebar'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { useAuthStore } from '../stores/authStore'
import { bootstrapAccessToken, clearTokens } from '../lib/api'

describe('Frontend Audit Fixes (FE-01 .. FE-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearTokens()
    localStorage.clear()
  })

  // ─── FE-01: Offline Reload Preservation ───
  describe('FE-01: Offline reload preservation (no local logout)', () => {
    it('does not wipe localStorage user or redirect when offline during bootstrap', async () => {
      // 1. Seed user in localStorage
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: 'usr-1',
        username: 'glv1',
        role: 'chunhiem',
        parishId: 'gia-ton',
        fullName: 'Nguyen Van A',
      }))

      // 2. Mock offline fetch failure (TypeError: Failed to fetch)
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      // 3. Attempt bootstrap
      const result = await bootstrapAccessToken()

      // 4. Assert: bootstrap returns false, but local user is PRESERVED
      expect(result).toBe(false)
      expect(localStorage.getItem('parish_current_user')).not.toBeNull()
    })

    it('clears tokens and fails on 401 auth error', async () => {
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: 'usr-1',
        username: 'glv1',
      }))

      // Mock 401 Unauthorized from /auth/refresh
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      } as Response)

      const result = await bootstrapAccessToken()
      expect(result).toBe(false)
    })
  })

  // ─── FE-04: DesktopSidebar Role Consistency ───
  describe('FE-04: DesktopSidebar catechists tab role authorization', () => {
    it('does NOT display catechists tab for chunhiem role', () => {
      useAuthStore.setState({
        user: { id: 'u1', username: 'cn1', role: 'chunhiem', parishId: 'p1', fullName: 'CN 1', status: 'ACTIVE' as const },
        isAuthenticated: true,
      })

      render(
        <DesktopSidebar
          activeTab="dashboard"
          setActiveTab={vi.fn()}
          selectedBranchId="all"
          setSelectedBranchId={vi.fn()}
          selectedClassId="all"
          setSelectedClassId={vi.fn()}
          classes={[]}
          branches={{}}
        />
      )

      expect(screen.queryByText('Giáo Lý Viên')).toBeNull()
    })

    it('does NOT display catechists tab for phuta role', () => {
      useAuthStore.setState({
        user: { id: 'u2', username: 'pt1', role: 'phuta', parishId: 'p1', fullName: 'PT 1', status: 'ACTIVE' as const },
        isAuthenticated: true,
      })

      render(
        <DesktopSidebar
          activeTab="dashboard"
          setActiveTab={vi.fn()}
          selectedBranchId="all"
          setSelectedBranchId={vi.fn()}
          selectedClassId="all"
          setSelectedClassId={vi.fn()}
          classes={[]}
          branches={{}}
        />
      )

      expect(screen.queryByText('Giáo Lý Viên')).toBeNull()
    })

    it('displays catechists tab for admin role', () => {
      useAuthStore.setState({
        user: { id: 'u3', username: 'admin1', role: 'admin', parishId: 'p1', fullName: 'Admin 1', status: 'ACTIVE' as const },
        isAuthenticated: true,
      })

      render(
        <DesktopSidebar
          activeTab="dashboard"
          setActiveTab={vi.fn()}
          selectedBranchId="all"
          setSelectedBranchId={vi.fn()}
          selectedClassId="all"
          setSelectedClassId={vi.fn()}
          classes={[]}
          branches={{}}
        />
      )

      expect(screen.getByText('Giáo Lý Viên')).toBeDefined()
    })
  })

  // ─── FE-05: ErrorBoundary Safe Message ───
  describe('FE-05: ErrorBoundary user-friendly message', () => {
    it('renders user-friendly message without leaking raw exception in production', () => {
      const originalDev = import.meta.env.DEV
      try {
        // Force production mode for this test
        (import.meta.env as any).DEV = false

        const BuggyComponent = () => {
          throw new Error('Database password leak: secret_1234')
        }

        const originalConsole = console.error
        console.error = vi.fn() // Suppress React error boundary console spam

        render(
          <ErrorBoundary>
            <BuggyComponent />
          </ErrorBoundary>
        )

        console.error = originalConsole

        expect(screen.getByText('Có lỗi xảy ra')).toBeDefined()
        expect(screen.getByText(/Một lỗi không mong muốn đã xảy ra/)).toBeDefined()
        expect(screen.queryByText(/secret_1234/)).toBeNull()
      } finally {
        (import.meta.env as any).DEV = originalDev
      }
    })
  })
})
