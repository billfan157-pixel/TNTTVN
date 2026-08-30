import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from '../../components/common/ui/Badge'
import { Button, IconButton } from '../../components/common/ui/Button'
import { Select, TextArea, TextInput } from '../../components/common/ui/FormControls'
import { FilterChips, SegmentedControl, TabPanel, Tabs } from '../../components/common/ui/SelectionControls'
import { Surface } from '../../components/common/ui/Surface'

const items = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'detail', label: 'Chi tiết' },
  { value: 'disabled', label: 'Không dùng', disabled: true },
] as const

function TabsHarness() {
  const [value, setValue] = useState<'overview' | 'detail' | 'disabled'>('overview')
  return (
    <>
      <Tabs id="student-tabs" ariaLabel="Hồ sơ thiếu nhi" items={items} value={value} onValueChange={setValue} />
      <TabPanel tabsId="student-tabs" value="overview" activeValue={value}>Nội dung tổng quan</TabPanel>
      <TabPanel tabsId="student-tabs" value="detail" activeValue={value}>Nội dung chi tiết</TabPanel>
    </>
  )
}

function SegmentedHarness() {
  const [value, setValue] = useState<'overview' | 'detail' | 'disabled'>('overview')
  return <SegmentedControl id="mode" ariaLabel="Chế độ" items={items} value={value} onValueChange={setValue} />
}

function FilterHarness() {
  const [value, setValue] = useState<'all' | 'active'>('all')
  return (
    <FilterChips
      ariaLabel="Lọc trạng thái"
      items={[{ value: 'all', label: 'Tất cả' }, { value: 'active', label: 'Đang học' }]}
      value={value}
      onValueChange={setValue}
    />
  )
}

describe('typed UI primitives', () => {
  it('maps Button variants, preserves submit semantics and exposes loading state', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button variant="secondary" type="submit" onClick={onClick}>Lưu</Button>)
    const button = screen.getByRole('button', { name: 'Lưu' })
    expect(button).toHaveClass('btn', 'btn-secondary')
    expect(button).toHaveAttribute('type', 'submit')

    rerender(<Button loading loadingLabel="Đang lưu">Lưu</Button>)
    expect(screen.getByRole('button', { name: 'Đang lưu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Đang lưu' })).toHaveAttribute('aria-busy', 'true')
  })

  it('requires an accessible IconButton label and forwards its ref', () => {
    let node: HTMLButtonElement | null = null
    render(<IconButton ref={value => { node = value }} label="Đóng" icon={<span aria-hidden="true">×</span>} />)
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveClass('btn-icon')
    expect(node).toBe(screen.getByRole('button', { name: 'Đóng' }))
  })

  it('maps typed form controls to the shared form contract', () => {
    render(
      <>
        <TextInput aria-label="Tên" invalid />
        <Select aria-label="Lớp"><option>Lớp 1</option></Select>
        <TextArea aria-label="Ghi chú" />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Tên' })).toHaveClass('form-input')
    expect(screen.getByRole('textbox', { name: 'Tên' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox', { name: 'Lớp' })).toHaveClass('form-select')
    expect(screen.getByRole('textbox', { name: 'Ghi chú' })).toHaveClass('form-textarea')
  })

  it('associates tabs and active panel, with manual roving keyboard focus', () => {
    render(<TabsHarness />)
    const overview = screen.getByRole('tab', { name: 'Tổng quan' })
    const detail = screen.getByRole('tab', { name: 'Chi tiết' })
    expect(overview).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Tổng quan')

    overview.focus()
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    expect(detail).toHaveFocus()
    expect(overview).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(detail)
    expect(detail).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Nội dung chi tiết')

    fireEvent.keyDown(detail, { key: 'End' })
    expect(detail).toHaveFocus()
  })

  it('uses radio semantics and automatic arrow activation for segmented controls', () => {
    render(<SegmentedHarness />)
    const overview = screen.getByRole('radio', { name: 'Tổng quan' })
    const detail = screen.getByRole('radio', { name: 'Chi tiết' })
    overview.focus()
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    expect(detail).toHaveFocus()
    expect(detail).toHaveAttribute('aria-checked', 'true')
  })

  it('uses pressed-button semantics for filter chips', () => {
    render(<FilterHarness />)
    const active = screen.getByRole('button', { name: 'Đang học' })
    fireEvent.click(active)
    expect(active).toHaveAttribute('aria-pressed', 'true')
  })

  it('maps Badge and Surface variants without embedding domain rules', () => {
    render(
      <Surface as="section" variant="entity" aria-label="Hồ sơ">
        <Badge tone="success">Đang học</Badge>
      </Surface>,
    )
    expect(screen.getByRole('region', { name: 'Hồ sơ' })).toHaveClass('entity-card')
    expect(screen.getByText('Đang học')).toHaveClass('badge', 'badge-success')
  })
})
