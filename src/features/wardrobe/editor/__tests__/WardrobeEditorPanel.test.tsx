import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { generateAppearance } from '@/scene/characters/generate'
import { DEFAULT_CATALOG, loadCatalog, type CatalogItem } from '@/scene/characters/catalog'
import { getSlotItemId } from '../../logic'
import { useWardrobeEditor } from '../../useWardrobeEditor'
import { WardrobeEditorPanel } from '../WardrobeEditorPanel'

const vest: CatalogItem = {
  id: 'top_vest_t',
  slot: 'top',
  label: { vi: 'Áo vest', en: 'Vest' },
  bases: ['female', 'male'],
  model: null,
  thumb: 'thumbs/vest.webp',
  attach: 'skinned',
  tint: { regions: ['primary'], defaults: { primary: 'c_white' } },
  hides: [],
  bodyLimits: { build: [0.2, 0.6] },
  tags: ['office'],
  credit: 'test',
}

const catalogWithVest = loadCatalog({
  slotFiles: [{ items: DEFAULT_CATALOG.items.filter((i) => i.slot !== 'top') }, { items: [...DEFAULT_CATALOG.bySlot.top, vest] }],
})

function renderPanel(catalog = DEFAULT_CATALOG) {
  return render(
    <I18nProvider>
      <WardrobeEditorPanel catalog={catalog} />
    </I18nProvider>,
  )
}

function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 })
}

function load(catalog = DEFAULT_CATALOG, id = 'emp_t', base: 'female' | 'male' = 'female') {
  let doc = generateAppearance(id, catalog)
  for (let i = 0; doc.base !== base && i < 200; i += 1) doc = generateAppearance(`${id}${i}`, catalog)
  act(() => useWardrobeEditor.getState().load(id, doc, 1))
  return doc
}

beforeEach(() => {
  localStorage.clear()
  useWardrobeEditor.getState().close()
})
afterEach(cleanup)

describe('slot tabs and item grid', () => {
  it('shows the nine tabs in order', () => {
    load()
    renderPanel()
    const tabs = within(screen.getByRole('tablist', { name: 'Nhóm trang phục' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Dáng', 'Mặt', 'Tóc', 'Áo', 'Quần', 'Váy/Bộ', 'Khoác', 'Giày', 'Phụ kiện',
    ])
  })

  it('selects with click and moves selection with arrow keys', () => {
    load()
    renderPanel()
    openTab('Áo')
    const group = screen.getByRole('radiogroup', { name: 'Áo' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.length).toBe(DEFAULT_CATALOG.bySlot.top.length)
    fireEvent.click(radios[1]!)
    expect(getSlotItemId(useWardrobeEditor.getState().draft!, 'top')).toBe(DEFAULT_CATALOG.bySlot.top[1]!.id)
    fireEvent.keyDown(radios[1]!, { key: 'ArrowRight' })
    expect(getSlotItemId(useWardrobeEditor.getState().draft!, 'top')).toBe(DEFAULT_CATALOG.bySlot.top[2]!.id)
    expect(document.activeElement).toBe(within(group).getAllByRole('radio')[2])
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(getSlotItemId(useWardrobeEditor.getState().draft!, 'top')).toBe(DEFAULT_CATALOG.bySlot.top[0]!.id)
  })

  it('uses a roving tab stop and lazy thumbnails from the assets base url', () => {
    load()
    renderPanel()
    openTab('Áo')
    const radios = within(screen.getByRole('radiogroup', { name: 'Áo' })).getAllByRole('radio')
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1)
    const img = radios[0]!.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('src')).toContain('assets/thumbs/')
  })

  it('offers a none option for optional slots and removes the item', () => {
    load()
    renderPanel()
    openTab('Phụ kiện')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Kính' }), { button: 0 })
    const group = screen.getByRole('radiogroup', { name: 'Kính' })
    fireEvent.click(within(group).getAllByRole('radio')[1]!)
    expect(getSlotItemId(useWardrobeEditor.getState().draft!, 'glasses')).not.toBeNull()
    fireEvent.click(within(group).getByRole('radio', { name: 'Không chọn' }))
    expect(getSlotItemId(useWardrobeEditor.getState().draft!, 'glasses')).toBeNull()
  })

  it('has no none option for required slots', () => {
    load()
    renderPanel()
    openTab('Áo')
    expect(within(screen.getByRole('radiogroup', { name: 'Áo' })).queryByRole('radio', { name: 'Không chọn' })).toBeNull()
  })

  it('shows hidden-by state for a top while a fullbody is worn, and reports side effects', () => {
    load()
    renderPanel()
    openTab('Váy/Bộ')
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Váy/Bộ' })).getAllByRole('radio')[1]!)
    expect(screen.getByTestId('editor-note').textContent).toBe('')
    openTab('Áo')
    expect(screen.getByTestId('grid-hidden-note').textContent).toMatch(/Đang bị che bởi/)
  })

  it('shows Phụ kiện sub-tabs', () => {
    load()
    renderPanel()
    openTab('Phụ kiện')
    const names = screen.getAllByRole('tab').map((t) => t.textContent)
    for (const n of ['Đầu', 'Kính', 'Tai', 'Cổ', 'Cổ tay', 'Túi']) expect(names).toContain(n)
  })
})

describe('colour pickers', () => {
  it('names swatches from colors.json and writes the pick to the draft', () => {
    load()
    renderPanel()
    openTab('Tóc')
    const group = screen.getByRole('radiogroup', { name: 'Màu tóc' })
    const first = DEFAULT_CATALOG.colors.hair[0]!
    const second = DEFAULT_CATALOG.colors.hair[1]!
    expect(within(group).getByRole('radio', { name: first.label.vi })).toBeTruthy()
    fireEvent.click(within(group).getByRole('radio', { name: second.label.vi }))
    expect(useWardrobeEditor.getState().draft!.hair.color).toBe(second.key)
    expect(within(group).getByRole('radio', { name: second.label.vi }).getAttribute('aria-checked')).toBe('true')
  })

  it('toggles blush on the face tab', () => {
    const doc = load()
    renderPanel()
    openTab('Mặt')
    const box = screen.getByRole('checkbox', { name: 'Má hồng' })
    expect((box as HTMLInputElement).checked).toBe(doc.face.blush)
    fireEvent.click(box)
    expect(useWardrobeEditor.getState().draft!.face.blush).toBe(!doc.face.blush)
  })

  it('offers fabric swatches for a tinted top and stores the region colour', () => {
    load()
    renderPanel()
    openTab('Áo')
    const draft = useWardrobeEditor.getState().draft!
    const item = DEFAULT_CATALOG.byId.get(draft.outfit.top!)!
    const group = screen.getByRole('radiogroup', { name: `${item.label.vi}: Chính` })
    const target = DEFAULT_CATALOG.colors.fabric[3]!
    fireEvent.click(within(group).getByRole('radio', { name: target.label.vi }))
    expect(useWardrobeEditor.getState().draft!.colors[item.id]?.primary).toBe(target.key)
  })
})

describe('body tab', () => {
  it('has labelled native range inputs with step <= 0.01', () => {
    load()
    renderPanel()
    const slider = screen.getByLabelText('Chiều cao') as HTMLInputElement
    expect(slider.type).toBe('range')
    expect(Number(slider.step)).toBeLessThanOrEqual(0.01)
    expect([slider.min, slider.max]).toEqual(['0', '1'])
    for (const n of ['Thể trạng', 'Cơ bắp', 'Ngực', 'Hông', 'Vai']) expect(screen.getByLabelText(n)).toBeTruthy()
  })

  it('commits a slider change after release as one undo step', () => {
    load()
    renderPanel()
    const slider = screen.getByLabelText('Chiều cao') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.31' } })
    fireEvent.change(slider, { target: { value: '0.32' } })
    fireEvent.pointerUp(slider)
    expect(useWardrobeEditor.getState().draft!.body.height).toBe(0.32)
    expect(useWardrobeEditor.getState().history).toHaveLength(2)
  })

  it('narrows a slider max/min and names the limiting item when a fitted item is worn', () => {
    const doc = load(DEFAULT_CATALOG)
    expect(getSlotItemId(doc, 'top')).not.toBe('top_vest_t')
    renderPanel(catalogWithVest)
    const build = screen.getByLabelText('Thể trạng') as HTMLInputElement
    expect(build.min).toBe('0')
    expect(build.max).toBe('1')
    // put the vest on: the body does not fit, so the clamp dialog asks first
    openTab('Áo')
    fireEvent.click(screen.getByRole('radio', { name: 'Áo vest' }))
    const confirm = screen.queryByRole('button', { name: 'Chỉnh dáng cho vừa' })
    if (confirm) fireEvent.click(confirm)
    expect(getSlotItemId(useWardrobeEditor.getState().draft!, 'top')).toBe('top_vest_t')
    openTab('Dáng')
    const after = screen.getByLabelText('Thể trạng') as HTMLInputElement
    expect(after.min).toBe('0.2')
    expect(after.max).toBe('0.6')
    expect(screen.getByText(/Áo vest giới hạn dáng người/)).toBeTruthy()
  })
})

describe('clamp dialog', () => {
  function withExtremeBuild() {
    const doc = generateAppearance('emp_x', catalogWithVest)
    const extreme = { ...doc, body: { ...doc.body, build: 0.95 }, outfit: { ...doc.outfit, top: DEFAULT_CATALOG.bySlot.top[0]!.id } }
    act(() => useWardrobeEditor.getState().load('emp_x', extreme, 1))
  }

  it('cancel keeps the previous look', () => {
    withExtremeBuild()
    renderPanel(catalogWithVest)
    openTab('Áo')
    fireEvent.click(screen.getByRole('radio', { name: 'Áo vest' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('clamp-list').textContent).toMatch(/Thể trạng: 95 → 60/)
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ, giữ nguyên' }))
    expect(useWardrobeEditor.getState().draft!.outfit.top).toBe(DEFAULT_CATALOG.bySlot.top[0]!.id)
    expect(useWardrobeEditor.getState().draft!.body.build).toBe(0.95)
  })

  it('confirm applies the item and clamps the body in one undo step', () => {
    withExtremeBuild()
    renderPanel(catalogWithVest)
    openTab('Áo')
    fireEvent.click(screen.getByRole('radio', { name: 'Áo vest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh dáng cho vừa' }))
    const d = useWardrobeEditor.getState().draft!
    expect(d.outfit.top).toBe('top_vest_t')
    expect(d.body.build).toBe(0.6)
    expect(useWardrobeEditor.getState().history).toHaveLength(2)
  })
})
