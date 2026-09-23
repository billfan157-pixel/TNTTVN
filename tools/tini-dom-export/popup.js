let lastExtractedJson = ''

async function checkCurrentTab() {
  const statusEl = document.getElementById('tab-status')
  const exportBtn = document.getElementById('export')

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = new URL(tab?.url || '')
    const isTini = url.hostname === 'ccams.thongtinxuanloc.com' && url.pathname === '/glv'

    if (isTini) {
      statusEl.className = 'tab-status ready'
      statusEl.textContent = '✓ Đã kết nối trang tra cứu điểm danh TINI'
      exportBtn.disabled = false
    } else {
      statusEl.className = 'tab-status not-ready'
      statusEl.textContent = '⚠ Hãy tự mở trang TINI /glv trước khi xuất'
      exportBtn.disabled = true
    }
  } catch {
    statusEl.className = 'tab-status not-ready'
    statusEl.textContent = 'Chưa thể xác định tab hiện tại.'
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void checkCurrentTab()

  const copyBtn = document.getElementById('copy')
  copyBtn.addEventListener('click', async () => {
    if (!lastExtractedJson) return
    try {
      await navigator.clipboard.writeText(lastExtractedJson)
      const originalText = copyBtn.textContent
      copyBtn.textContent = '✓ Đã sao chép vào Clipboard!'
      setTimeout(() => { copyBtn.textContent = originalText }, 2500)
    } catch {
      copyBtn.textContent = 'Không thể sao chép tự động.'
    }
  })

  document.getElementById('export').addEventListener('click', async () => {
    const button = document.getElementById('export')
    const resultBox = document.getElementById('result')
    const originalBtnHtml = button.innerHTML

    button.disabled = true
    button.textContent = 'Đang trích xuất & băm SHA-256…'
    resultBox.className = 'result-box'
    resultBox.style.display = 'none'

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = new URL(tab?.url || '')
      if (url.hostname !== 'ccams.thongtinxuanloc.com' || url.pathname !== '/glv' || !tab?.id) {
        throw new Error('Vui lòng mở trang tra cứu điểm danh TINI (ccams.thongtinxuanloc.com/glv) trước khi xuất.')
      }

      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'ISOLATED',
        func: globalThis.extractTiniDom,
      })

      const result = injection?.result
      if (!result || result.error) {
        throw new Error(result?.error || 'Không đọc được bảng điểm danh trên trang.')
      }
      if (result.observations.length === 0) {
        throw new Error('Trang chưa có dòng điểm danh nào được tải sẵn.')
      }

      for (const observation of result.observations) {
        const canonical = JSON.stringify([
          result.academicYear.externalId,
          observation.externalStudentId,
          observation.externalClassId,
          observation.date,
          observation.sourceTitle,
          observation.late,
          observation.studentName,
          observation.className,
          observation.dateOfBirth,
        ])
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
        observation.sourceFingerprint = [...new Uint8Array(digest)]
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('')
      }

      lastExtractedJson = JSON.stringify(result, null, 2)
      copyBtn.style.display = 'block'

      const blob = new Blob([lastExtractedJson], { type: 'application/json' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = `tini-attendance-${result.scope.date || 'export'}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(href), 60_000)

      if (result.partial) {
        resultBox.className = 'result-box warning'
        resultBox.innerHTML = `<strong>Đã xuất ${result.observations.length} lượt</strong> từ ${result.renderedStudentRows} dòng.<br>⚠ <em>Cảnh báo:</em> Trang vẫn còn nút “Xem thêm”. Hãy bấm xem hết các dòng trên web TINI rồi xuất lại để có tệp đầy đủ.`
      } else {
        resultBox.className = 'result-box success'
        let extraNote = ''
        if (result.rowErrors && result.rowErrors.length > 0) {
          extraNote = `<br><small style="color:var(--muted)">Đã bỏ qua ${result.rowErrors.length} dòng không đọc được định danh hợp lệ.</small>`
        }
        resultBox.innerHTML = `<strong>✓ Xuất thành công!</strong><br>Đã lưu <strong>${result.observations.length} lượt điểm danh</strong> (từ ${result.renderedStudentRows} dòng học viên, ngày ${result.scope.date}).${extraNote}`
      }
    } catch (error) {
      resultBox.className = 'result-box error'
      resultBox.innerHTML = `<strong>Lỗi:</strong> ${error instanceof Error ? error.message : 'Không thể xuất tệp.'}`
    } finally {
      button.disabled = false
      button.innerHTML = originalBtnHtml
      void checkCurrentTab()
    }
  })
})
