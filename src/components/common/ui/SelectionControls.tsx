import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'

export interface SelectionItem<Value extends string> {
  value: Value
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  ariaLabel?: string
}

const controlId = (rootId: string, kind: 'tab' | 'panel', value: string) => (
  `${rootId}-${kind}-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
)

const moveRovingFocus = (
  event: KeyboardEvent<HTMLButtonElement>,
  selector: string,
  activate: boolean,
) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const controls = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(selector) ?? [])
    .filter(control => !control.disabled)
  if (controls.length === 0) return

  event.preventDefault()
  const currentIndex = Math.max(0, controls.indexOf(event.currentTarget))
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? controls.length - 1
      : event.key === 'ArrowRight'
        ? (currentIndex + 1) % controls.length
        : (currentIndex - 1 + controls.length) % controls.length
  controls[nextIndex].focus()
  if (activate) controls[nextIndex].click()
}

export interface TabsProps<Value extends string> {
  id: string
  ariaLabel: string
  items: ReadonlyArray<SelectionItem<Value>>
  value: Value
  onValueChange: (value: Value) => void
  className?: string
  activation?: 'manual' | 'automatic'
}

export function Tabs<Value extends string>({
  id,
  ariaLabel,
  items,
  value,
  onValueChange,
  className = '',
  activation = 'manual',
}: TabsProps<Value>) {
  return (
    <div id={id} role="tablist" aria-label={ariaLabel} className={`view-tabs ${className}`.trim()}>
      {items.map(item => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            id={controlId(id, 'tab', item.value)}
            type="button"
            role="tab"
            aria-label={item.ariaLabel}
            aria-selected={selected}
            aria-controls={controlId(id, 'panel', item.value)}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className={`view-tab ${selected ? 'is-active' : ''}`.trim()}
            onClick={() => onValueChange(item.value)}
            onKeyDown={event => moveRovingFocus(event, '[role="tab"]', activation === 'automatic')}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export interface TabPanelProps<Value extends string> extends HTMLAttributes<HTMLDivElement> {
  tabsId: string
  value: Value
  activeValue: Value
}

export function TabPanel<Value extends string>({
  tabsId,
  value,
  activeValue,
  className = '',
  children,
  ...props
}: TabPanelProps<Value>) {
  if (value !== activeValue) return null
  return (
    <div
      {...props}
      id={controlId(tabsId, 'panel', value)}
      role="tabpanel"
      aria-labelledby={controlId(tabsId, 'tab', value)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  )
}

export interface SegmentedControlProps<Value extends string> {
  id: string
  ariaLabel: string
  items: ReadonlyArray<SelectionItem<Value>>
  value: Value
  onValueChange: (value: Value) => void
  className?: string
}

export function SegmentedControl<Value extends string>({
  id,
  ariaLabel,
  items,
  value,
  onValueChange,
  className = '',
}: SegmentedControlProps<Value>) {
  return (
    <div id={id} role="radiogroup" aria-label={ariaLabel} className={`view-tabs ${className}`.trim()}>
      {items.map(item => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-label={item.ariaLabel}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className={`view-tab ${selected ? 'is-active' : ''}`.trim()}
            onClick={() => onValueChange(item.value)}
            onKeyDown={event => moveRovingFocus(event, '[role="radio"]', true)}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export interface FilterChipsProps<Value extends string> {
  ariaLabel: string
  items: ReadonlyArray<SelectionItem<Value>>
  value: Value
  onValueChange: (value: Value) => void
  className?: string
  appearance?: 'grouped' | 'pills'
}

export function FilterChips<Value extends string>({
  ariaLabel,
  items,
  value,
  onValueChange,
  className = '',
  appearance = 'grouped',
}: FilterChipsProps<Value>) {
  const usesPills = appearance === 'pills'
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${usesPills ? 'flex items-center gap-2' : 'pill-group'} ${className}`.trim()}
    >
      {items.map(item => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            aria-label={item.ariaLabel}
            aria-pressed={selected}
            disabled={item.disabled}
            className={usesPills
              ? `pill-btn ${selected ? 'pill-btn-primary' : 'pill-btn-secondary'}`
              : `pill-group-item ${selected ? 'active' : ''}`.trim()}
            onClick={() => onValueChange(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
