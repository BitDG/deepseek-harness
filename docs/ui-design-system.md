# DSH interface design system

English | [中文](ui-design-system.zh.md)

## Summary

Use this reference to compose DSH interfaces from existing controls and theme tokens. Open Settings → UI components to try the production components with sample data. The catalog covers controls, output cards, visual tokens and composition states; sample actions never execute commands or save files. Its Light and Dark buttons change the real appearance preference.

## Table of Contents

- [Component selection](#component-selection)
- [Visual rules](#visual-rules)
- [Composition and feedback](#composition-and-feedback)
- [Interaction and accessibility](#interaction-and-accessibility)
- [Implementation and verification](#implementation-and-verification)

-----

<a id="component-selection"></a>
## Component selection

The [primitive catalog](../packages/client/ui-primitives/README.md#component-catalog) owns exported parameters and behavior. The [interactive catalog package](../packages/client/ui-design-system/README.md) owns demonstration behavior. Consult those owners before adding another control.

| Intent | Component | Selection rule |
|---|---|---|
| Explicit action | `Button` | `accent` for the region's explicit main action; `primary` for neutral emphasis; `outline` for secondary actions; `ghost` for quiet actions; `toolbar` for grouped tools. |
| Single-line input | `Input` | Give every input a visible label or accessible name. Keep validation messages adjacent and connect them with `aria-describedby`; mark invalid values with `aria-invalid`. |
| Binary choice | `Switch`, `Checkbox` | Use a switch for an immediate on/off option and a checkbox for inclusion or acknowledgement. Pass checked state and localized labels. |
| Filter or fact | `Pill`, `Tag` | Interactive pills change selection; tags describe a fact and never imitate a button. |
| State | `StateDot`, `ConnectionIndicator` | Place a text description beside a dot; connection feedback names the retry action and distinguishes retrying from recovery. |
| Hidden detail | `DisclosureRow` | Keep the title row stable; expand details on demand. |
| Transient content | `Menu`, `Tooltip`, `HoverCard` | Menus carry actions, tooltips supplement labels, hover cards carry readable previews. Essential information remains available without hover. |
| Confirmation or notice | `Modal`, `RiskConfirmation`, `Toast` | Dialogs explain consequences and offer cancellation; risk confirmation requires explicit acknowledgement; toast reports an observed outcome. |
| Agent output | `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock`, `WebBlock` | Choose by result meaning; retain paths, exit states, line numbers, totals and truncation information. |
| Rich content | `MarkdownText`, `CodeBlock`, `JsonTree` | Use existing safe rendering and copy behavior; never render raw model HTML. |
| Identity or file category | Shared icons, `FishLogo`, `BrandWordmark`, `FileTypeIcon`, `ReferenceIcon`, `LinkIcon` | Reuse the shared artwork and classification rather than drawing feature-specific replacements. |

-----

<a id="visual-rules"></a>
## Visual rules

[Web styling](web-styling.md) owns styling policy; [theme source](../packages/client/ui-theme/src/styles/) owns token values and light/dark mapping. The catalog swatches consume the same variables as product controls; text selection copies their names. Do not maintain a second palette in this document or in feature styles.

- Use `--dsw-alias-*` semantic colors for backgrounds, labels, interactions, borders and states. Reserve stronger brand emphasis for one explicit primary action per region.
- Use `--dsw-font-family` for interface text and `--ds-font-family-code` for code and variable names. Pair every font size with a line height; reuse an existing theme typography role when it fits.
- Keep standard `Button` geometry at 36px high with r18; compact buttons at 28px with r14; `Switch` at 36×20px; `DisclosureRow` at 24px high. `Input` has a 32px wrapper with r8. These component-owned sizes do not prescribe arbitrary list or spreadsheet dimensions.
- Choose spacing by relationship: adjacent controls need less separation than unrelated sections. The catalog uses 4/8/12/16/24px; this page does not introduce a new global spacing-token namespace.
- Neutral solid borders and separators use 0.5px. Elevated surfaces use the existing elevation shadows without adding a second neutral border. Keep state-colored borders at their owning component's width.
- Capsules and circles pair a full-round radius with `corner-shape: round`; other rounded surfaces inherit theme smoothing on supporting browsers.
- Keep transitions on the existing theme timing and curves. Respect `prefers-reduced-motion`; never require motion to understand progress or state.

-----

<a id="composition-and-feedback"></a>
## Composition and feedback

Navigation, collections, lists and reading/editing content occupy stable neighboring regions. Feature plugins contribute to the existing shell through slots. Headings, tabs and icon actions align within their owning header; the first selectable row has visible separation from the header divider.

| Situation | Required visible information | Recovery or action |
|---|---|---|
| Loading | Name the pending operation; preserve the object and disable duplicate submission. | Keep cancellation where the owning operation supports it. |
| Empty collection | Explain what is absent. | Offer the applicable create/import action. |
| No filter matches | Explain that the current filter has no matches. | Offer a clear-filter action. |
| Failure | State what failed and what remains usable; keep a readable text message. | Offer a retry or correction only when it is supported. |
| Completion | Report success only after the operation succeeds. | Keep the resulting object or saved state visible. |
| File or external data | Name source and selected file, branch, folder, sheet or note where applicable. | Distinguish draft, local save and completed remote operation. |

The catalog's Composition tab demonstrates filter-empty and retryable-error states with local sample data. Its tags and notifications describe the sample, not a real file save or remote request.

-----

<a id="interaction-and-accessibility"></a>
## Interaction and accessibility

Give controls localized visible text and accessible names through the typed locale dictionary. Preserve visible keyboard focus on borderless controls; bordered inputs use their own focus border. Disabled state keeps context and blocks the action; loading state additionally describes the operation.

Menus retain their shared keyboard behavior: arrows/Home/End move, Enter or Tab selects the focused row, and Escape or Shift+Tab closes and restores the trigger. Catalog tabs use a roving tab stop with Left/Right/Home/End navigation. Its nested sample dialog captures Escape before the Settings shell, keeps Tab within its own controls, and returns focus to its trigger when closed. A production owner must verify its own dialog containment and restoration; merely using `Modal` does not supply that owner behavior.

Status never relies on color alone. Error text identifies a corrective action. Tooltip content supplements a label, while essential actions remain directly reachable. Long source output preserves columns and provides the shared scrolling and copy controls.

-----

<a id="implementation-and-verification"></a>
## Implementation and verification

Reuse [ui-primitives](../packages/client/ui-primitives/README.md) before writing a control. A control needed by a second feature belongs there; a deliberate visual variation becomes a prop rather than a duplicated implementation. Business data, localization and composition remain in the owning feature. Shared runtime imports never cross from one feature plugin to another.

The catalog registers into `settings.section` and uses the existing theme service for preference writes. Other demonstrations remain component-local state and fixed sample content. Its package exports only loader entries, uses CSS Modules and semantic theme tokens, and adds no model tools, prompts or session events.

Verify changes with package type checking, focused interaction tests and a real assembled Web composition. Check light/dark rendering, keyboard navigation, dialog restoration, copy and folding, empty/error recovery and desktop resizing. Screenshots show appearance; an interaction GIF records the running page. Static graphs establish impact, not runtime success.

## Dev Note

The interactive page samples the most commonly shared controls and output renderers; the primitive README remains the complete export catalog. Business-specific conversation composition and onboarding remain in their owning packages.
