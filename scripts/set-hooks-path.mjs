#!/usr/bin/env node
/**
 * QUALITY-GATE-1: kích hoạt pre-commit hook (.githooks) qua git hooksPath.
 * Chạy tự động khi `npm install` (lifecycle "prepare").
 * PHẢI không bao giờ fail build: môi trường không có git (Docker builder,
 * artifact download) chỉ bỏ qua — hook là tiện ích dev, không phải yêu cầu.
 */
import { execSync } from 'node:child_process'

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' })
} catch {
  // Không có git hoặc không phải repo — bỏ qua im lặng.
}
