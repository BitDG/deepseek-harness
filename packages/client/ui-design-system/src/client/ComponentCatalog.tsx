import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, Checkbox, CodeBlock, DiffBlock, DisclosureRow, FileTypeIcon, HoverCard, Input,
  JsonTree, MarkdownText, Menu, Modal, Pill, ReadBlock, SearchBlock, StateDot, Switch, Tag,
  TerminalBlock, Toast, Tooltip, WebBlock,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ButtonVariant, StateDotState, TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogKey } from './locales.ts'
import css from './ComponentCatalog.module.css'

/** The catalog can switch the existing theme; sample interactions are local state. */
export interface CatalogInjected {
  setTheme: (id: 'light' | 'dark') => void
}

export type CatalogProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.designSystem'> & InjectFace<CatalogInjected>

type Tab = 'controls' | 'outputs' | 'tokens' | 'patterns'
const TAB_IDS: readonly Tab[] = ['controls', 'outputs', 'tokens', 'patterns']
const VARIANTS: readonly ButtonVariant[] = ['accent', 'primary', 'outline', 'ghost', 'toolbar']
const TAGS: readonly [TagTone, CatalogKey][] = [
  ['outline', 'all'], ['solid', 'selected'], ['neutral', 'information'], ['quiet', 'idle'],
  ['success', 'saved'], ['info', 'information'], ['warning', 'warning'], ['danger', 'failed'],
]
const STATES: readonly [StateDotState, CatalogKey][] = [
  ['done', 'done'], ['ongoing', 'ongoing'], ['warning', 'warning'], ['error', 'failed'], ['idle', 'idle'],
]
const TOKENS: readonly [CatalogKey, string][] = [
  ['background', '--dsw-alias-bg-base'], ['surface', '--dsw-alias-bg-layer-1'],
  ['nested', '--dsw-alias-bg-layer-2'], ['brand', '--dsw-alias-brand-primary'],
  ['text', '--dsw-alias-label-primary'], ['secondary', '--dsw-alias-label-secondary'],
  ['border', '--dsw-alias-border-l1'], ['link', '--dsw-alias-link'],
  ['successColor', '--dsw-alias-state-success-primary'], ['warningColor', '--dsw-alias-state-warn-primary'],
  ['errorColor', '--dsw-alias-state-error-primary'],
]
const SAMPLE_CODE = 'const button = {\n  variant: "accent",\n  size: "md",\n  disabled: false,\n}\n'
const SAMPLE_PATH = 'sample/button.ts'
const SAMPLE_BEFORE = 'variant: "ghost"\nsize: "md"\n'
const SAMPLE_AFTER = 'variant: "accent"\nsize: "md"\n'
const SAMPLE_FORMAT = 'Markdown'
const FONT_VARIABLES = '--dsw-font-family / --ds-font-family-code'
const MOTION_VARIABLES = '--ds-transition-duration-fast / --ds-transition-duration'

function Specimen({ title, note, children, name }: {
  title: string; note?: string; children: ReactNode; name: string
}) {
  return <section className={css.specimen} data-component={name}>
    <header className={css.specimenHeader}><h3>{title}</h3><code>{name}</code></header>
    {note !== undefined && <p className={css.note}>{note}</p>}
    <div className={css.example}>{children}</div>
  </section>
}

/** Render production components with sample data and localized usage guidance. */
export function ComponentCatalog({ t, setTheme }: CatalogProps) {
  const [tab, setTab] = useState<Tab>('controls')
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [checked, setChecked] = useState(false)
  const [selected, setSelected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuSelection, setMenuSelection] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [notification, setNotification] = useState(0)
  const [message, setMessage] = useState('')
  const [pattern, setPattern] = useState<'content' | 'empty' | 'error'>('content')
  const modalTrigger = useRef<HTMLSpanElement>(null)
  const modalContent = useRef<HTMLDivElement>(null)
  const identifier = useId()
  const errorId = `${identifier}-error`
  const panelId = `${identifier}-panel`
  const tabId = (value: Tab) => `${identifier}-${value}`
  const announce = () => { setMessage(t('clicked')) }
  const closeModal = () => { setModalOpen(false) }

  // This nested sample dialog owns keyboard dismissal before the Settings shell.
  // Scope focus traversal to its portal and return focus to its surviving trigger.
  useEffect(() => {
    if (!modalOpen) return
    const dialog = modalContent.current?.closest<HTMLElement>('[role="dialog"]')
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
    ) ?? []).sort((left, right) =>
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setModalOpen(false)
      } else if (event.key === 'Tab') {
        const items = focusable()
        const current = items.indexOf(document.activeElement as HTMLElement)
        const next = event.shiftKey ? current - 1 : current + 1
        if (current < 0 || next < 0 || next >= items.length) {
          event.preventDefault()
          ;(event.shiftKey ? items.at(-1) : items[0])?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      modalTrigger.current?.querySelector('button')?.focus()
    }
  }, [modalOpen])

  const foldLabels = {
    copy: t('copy'), copied: t('copied'), collapse: t('collapse'), collapseAria: t('collapse'),
    expand: (hidden: number) => t('expand', { count: hidden }),
    expandAria: (hidden: number) => t('expand', { count: hidden }),
  }
  const markdownLabels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }

  return <div className={css.catalog} data-design-system>
    <header className={css.header}>
      <p className={css.eyebrow}>{t('eyebrow')}</p>
      <h2>{t('subtitle')}</h2>
      <p className={css.note}>{t('introduction')}</p>
      <div className={css.row}>
        <Tag tone="info">{t('examples')}</Tag>
        <div className={css.themeActions}>
          <Button size="sm" variant="outline" onClick={() => { setTheme('light') }}>{t('light')}</Button>
          <Button size="sm" variant="outline" onClick={() => { setTheme('dark') }}>{t('dark')}</Button>
        </div>
      </div>
      <p className={css.caption}>{t('themeNote')}</p>
    </header>
    <div role="tablist" aria-label={t('title')} className={css.tabs}>
      {TAB_IDS.map((value, index) => <Pill key={value} role="tab" id={tabId(value)}
        aria-controls={panelId} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
        active={tab === value} onClick={() => { setTab(value) }} onKeyDown={(event) => {
          const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
          const next = event.key === 'Home' ? TAB_IDS[0] : event.key === 'End' ? TAB_IDS.at(-1)
            : offset === 0 ? undefined : TAB_IDS[(index + offset + TAB_IDS.length) % TAB_IDS.length]
          if (next !== undefined) {
            event.preventDefault()
            setTab(next)
            document.getElementById(tabId(next))?.focus()
          }
        }}>{t(value)}</Pill>)}
    </div>
    <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} tabIndex={0} className={css.panel}>
      {tab === 'controls' && <>
        <Specimen title={t('buttons')} note={t('buttonsNote')} name="Button">
          <div className={css.wrap}>{VARIANTS.map(variant => <Button key={variant} variant={variant}
            onClick={announce}>{t(variant)}</Button>)}</div>
          <div className={css.wrap}>
            <Button variant="outline" size="sm" onClick={announce}>{t('compactButton')}</Button>
            <Button variant="accent" disabled>{t('disabled')}</Button>
            <Button variant="accent" disabled={loading} aria-busy={loading}
              onClick={() => { setLoading(true) }}>{loading ? t('loading') : t('startLoading')}</Button>
            {loading && <Button size="sm" variant="outline" onClick={() => { setLoading(false) }}>{t('finishLoading')}</Button>}
          </div>
          <p role="status" className={css.caption}>{message}</p>
        </Specimen>
        <Specimen title={t('fields')} note={t('fieldsNote')} name="Input / Switch / Checkbox">
          <div className={css.fields}>
            <label className={css.field}>{t('name')}<Input value={name} placeholder={t('placeholder')}
              onChange={event => { setName(event.currentTarget.value) }} /></label>
            <label className={css.field}>{t('invalidName')}<Input aria-invalid="true" aria-describedby={errorId}
              className={css.invalid ?? ''} value={t('invalidValue')} readOnly /><span id={errorId} className={css.errorText}>{t('invalidMessage')}</span></label>
            <label className={css.field}>{t('locked')}<Input value={t('locked')} disabled /></label>
          </div>
          <div className={css.wrap}><label className={css.inlineLabel}>{t('switchLabel')}
            <Switch label={t('switchLabel')} checked={enabled} onChange={setEnabled} /></label>
            <Switch label={t('disabledSwitch')} checked={false} disabled onChange={() => {}} />
            <Checkbox label={t('checkLabel')} checked={checked} onChange={setChecked} />
          </div>
        </Specimen>
        <Specimen title={t('selection')} note={t('selectionNote')} name="Pill / Tag / StateDot">
          <div className={css.wrap}><Pill active={!selected} aria-pressed={!selected}
            onClick={() => { setSelected(false) }}>{t('all')}</Pill><Pill active={selected} aria-pressed={selected}
              onClick={() => { setSelected(true) }}>{t('selected')}</Pill></div>
          <div className={css.wrap}>{TAGS.map(([tone, key]) => <Tag key={tone} tone={tone}>{t(key)}</Tag>)}</div>
          <div className={css.wrap}>{STATES.map(([state, key]) => <span key={state} className={css.inlineLabel}>
            <StateDot state={state} />{t(key)}</span>)}</div>
        </Specimen>
        <Specimen title={t('overlays')} note={t('overlaysNote')} name="Menu / Modal / Tooltip / Toast">
          <div className={css.wrap}><Menu open={menuOpen} autoFocus portal selectedId={menuSelection}
            anchor={<Button variant="outline" aria-expanded={menuOpen} aria-haspopup="menu"
              onClick={() => { setMenuOpen(!menuOpen) }}>{t('menu')}</Button>}
            items={[{ id: 'rename', label: t('rename') }, { id: 'duplicate', label: t('duplicate') },
              { type: 'separator', id: 'separator' }, { id: 'remove', label: t('remove'), danger: true }]}
            onSelect={id => { setMenuSelection(id); setMenuOpen(false) }} onClose={() => { setMenuOpen(false) }} />
            <span ref={modalTrigger}><Button variant="outline" onClick={() => { setModalOpen(true) }}>{t('modal')}</Button></span>
            <Button variant="outline" onClick={() => { setNotification(value => value + 1) }}>{t('toast')}</Button>
          </div>
          {menuSelection !== '' && <p role="status" className={css.caption}>
            {t('menuResult', { action: t(menuSelection as 'rename' | 'duplicate' | 'remove') })}</p>}
          <div className={css.wrap}><Tooltip label={t('tooltipText')} side="top">
            <button type="button" className={css.quietButton}>{t('tooltip')}</button></Tooltip>
            <HoverCard anchor={<Button size="sm">{t('hover')}</Button>} content={t('hoverText')}
              copyLabel={t('copy')} copiedLabel={t('copied')} />
          </div>
          <DisclosureRow icon={<StateDot state="done" />} title={t('disclosure')} open={detailsOpen}
            expandable expandOnRowClick onToggle={() => { setDetailsOpen(!detailsOpen) }}>
            <p className={css.note}>{t('disclosureBody')}</p></DisclosureRow>
        </Specimen>
      </>}
      {tab === 'outputs' && <>
        <p className={css.note}>{t('outputNote')}</p>
        <Specimen title={t('terminal')} name="TerminalBlock">
          <TerminalBlock command="pnpm run build" exitCode={0} maxLines={4}
            output={Array.from({ length: 12 }, (_, index) => `[sample] module-${String(index + 1)} ready`).join('\n')}
            labels={{ ...foldLabels, signal: value => t('signal', { value }), exitCode: value => t('exitCode', { value }),
              noExitCode: t('noExitCode'), running: t('ongoing'), failed: t('failed'), done: t('done'), noOutput: t('noOutput') }} />
        </Specimen>
        <Specimen title={t('read')} name="ReadBlock">
          <ReadBlock label={SAMPLE_PATH} lines={SAMPLE_CODE.trimEnd().split('\n').map((text, index) => ({ number: index + 1, text }))}
            totalLines={5} lang="typescript" labels={{ ...foldLabels, window: (shown, total) => t('readWindow', { shown, total }) }} />
        </Specimen>
        <Specimen title={t('diff')} name="DiffBlock">
          <DiffBlock diffs={[{ path: SAMPLE_PATH, oldText: SAMPLE_BEFORE,
            newText: SAMPLE_AFTER }]} labels={{ ...foldLabels, files: count => t('files', { count }) }} />
        </Specimen>
        <Specimen title={t('code')} name="CodeBlock"><CodeBlock code={SAMPLE_CODE} lang="typescript" lineNumbers
          copyLabel={t('copy')} copiedLabel={t('copied')} /></Specimen>
        <Specimen title={t('search')} name="SearchBlock"><SearchBlock kind="matches" total={2} truncated={false}
          files={[{ path: 'sample/button.ts', matches: [{ lineNumber: 2, line: 'variant: "accent",' },
            { lineNumber: 3, line: 'size: "md",' }] }]}
          labels={{ ...foldLabels, noResults: t('empty'), pathsSummary: (shown, total) => t('searchSummary', { shown, total }),
            matchesSummary: (shown, total, files) => t('matchesSummary', { shown, total, files }) }} /></Specimen>
        <Specimen title={t('web')} name="WebBlock"><WebBlock kind="fetch" url="https://example.com/sample"
          statusCode={200} truncated={false} labels={{ noResults: t('empty'), sourcesTruncated: t('truncatedSources'),
            http: t('http'), contentTruncated: t('truncatedContent'), markdown: markdownLabels }} /></Specimen>
        <Specimen title={t('markdown')} name="MarkdownText"><MarkdownText text={t('markdownSample')}
          labels={markdownLabels} /></Specimen>
        <Specimen title={t('json')} name="JsonTree"><JsonTree data={{ sample: true, button: { variant: 'accent', size: 'md' } }} label={t('json')}
          labels={{ copyValue: t('copyValue'), copyJson: t('copyJson'), copyPath: t('copyPath'), copyPrettyJson: t('copyPrettyJson'),
            copyCompactJson: t('copyCompactJson'), copied: t('copied'), copyFailed: t('copyFailed'),
            collapseNode: t('collapseNode'), expandNode: t('expandNode'), copyButtonTitle: action => action }} /></Specimen>
      </>}
      {tab === 'tokens' && <>
        <p className={css.note}>{t('tokenNote')}</p>
        <div className={css.swatches}>{TOKENS.map(([key, token]) => <div className={css.swatch} key={token}>
          <span className={css.color} aria-hidden style={{ '--catalog-swatch': `var(${token})` } as CSSProperties} />
          <div><strong>{t(key)}</strong><code>{token}</code></div>
        </div>)}</div>
        <Specimen title={t('geometry')} note={t('geometryNote')} name="Geometry">
          <dl className={css.metrics}>{([
            ['standardButton', '36px / r18'], ['compactButton', '28px / r14'], ['toggleGeometry', '36 × 20px'],
            ['disclosureGeometry', '24px'], ['hairline', '0.5px'], ['spacing', '4 / 8 / 12 / 16 / 24px'],
          ] as const).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl>
        </Specimen>
        <Specimen title={t('typography')} name="Typography"><p>{t('bodyFont')}</p>
          <code>{t('codeFont')}</code><code>{FONT_VARIABLES}</code></Specimen>
        <Specimen title={t('motion')} note={t('motionNote')} name="Motion">
          <code>{MOTION_VARIABLES}</code></Specimen>
      </>}
      {tab === 'patterns' && <>
        <Specimen title={t('composition')} note={t('compositionNote')} name="List / Empty / Error">
          <div className={css.wrap}>{(['content', 'empty', 'error'] as const).map(value => <Pill key={value}
            active={pattern === value} aria-pressed={pattern === value} onClick={() => { setPattern(value) }}>
            {t(value === 'content' ? 'showContent' : value === 'empty' ? 'showEmpty' : 'showError')}</Pill>)}</div>
          <div className={css.listDemo}>
            <header className={css.listHeader}><strong>{t('listExample')}</strong><Tag>{t('examples')}</Tag></header>
            {pattern === 'content' && <div className={css.listRow}><FileTypeIcon path="sample/component-notes.md" />
              <div><strong>{t('documentName')}</strong><p className={css.caption}>{t('documentSource')}</p></div>
              <Tag tone="info">{SAMPLE_FORMAT}</Tag></div>}
            {pattern !== 'content' && <div className={css.empty}><StateDot state={pattern === 'error' ? 'error' : 'idle'} />
              <strong>{t(pattern === 'error' ? 'error' : 'empty')}</strong>
              <p className={css.note}>{t(pattern === 'error' ? 'errorHint' : 'emptyHint')}</p>
              <Button variant="outline" size="sm" onClick={() => { setPattern('content') }}>
                {t(pattern === 'error' ? 'retry' : 'clearFilter')}</Button></div>}
          </div>
        </Specimen>
        <ul className={css.rules}>{(['layoutRule', 'focusRule', 'stateRule', 'sourceRule', 'reuseRule'] as const)
          .map(key => <li key={key}>{t(key)}</li>)}</ul>
      </>}
    </div>
    <p className={css.guide}>{t('guide')}</p>
    <Modal open={modalOpen} onClose={closeModal} title={t('modalTitle')} closeLabel={t('close')}
      description={t('modalDescription')} footer={<><Button variant="outline" onClick={closeModal}>{t('cancel')}</Button>
        <Button variant="accent" onClick={() => { closeModal(); setNotification(value => value + 1) }}>{t('confirm')}</Button></>}>
      <div ref={modalContent}><label className={css.field}>{t('modalField')}<Input placeholder={t('placeholder')} /></label></div>
    </Modal>
    {notification > 0 && <Toast key={notification} text={t('toastText')} onDone={() => { setNotification(0) }} />}
  </div>
}
