# Web UI style reference

English | [中文](web-styling.zh.md)

This reference defines styling ownership and component rules for browser client packages. The current token values live in [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); this document does not duplicate that generated-by-source inventory.

## Ownership

[`ui-theme`](../packages/client/ui-theme/README.md) owns the `--dsw-*` static scale, semantic aliases, typography, motion, gradients, shadows, scrollbar styles, and light/dark preference. [`ui-layout`](../packages/client/ui-layout/README.md) applies the resolved theme snapshot to the document. Feature packages consume semantic aliases and do not define another global theme.

Global style sheets belong in `ui-theme/src/styles/`. Component styles live beside their component as CSS Modules. A component may define a local custom property when its value is part of that component's layout or presentation contract; shared colors, typography, elevation, and motion belong to the theme package.

## Personal workbench baseline

The personal workbench keeps navigation, collections, item lists, and content in stable adjacent regions. New client plugins reuse the shell layout and shared controls; a feature may add a column or panel through its owning slot without defining another application frame.

The visual reference is `outputs/dsh-personal-workbench-prototype.html`. Its sample data and simulated integrations demonstrate the layout; the theme tokens and component rules in this document govern implementation.

- Use neutral document and surface tokens for reading and editing. Selected navigation rows and content tabs use soft-blue fill and blue text; the compact Tasks/Files/Git segmented switch keeps a white active segment with dark text for clear contrast. Use the stronger brand-blue accent for one explicit primary action in a region, not for every control. Reserve success color for a completed save, connection, or update rather than an unverified preview.
- Size and round controls by role: navigation rows, standard list rows and controls, compact tree rows and icon buttons, content surfaces, and dialogs each share one geometry rule across feature views. Use a shared spacing scale for adjacent columns and control groups; spreadsheet cells and reading content retain their task-specific dimensions.
- Center titles, tabs, and icon controls within the same header height. Leave a consistent gap between the header separator and the first selectable row so its selection background remains distinct from the line.
- Bordered text inputs show focus through their own blue border without an additional outer halo; keyboard focus remains visible on borderless controls.
- Use the shared `Button` `accent` variant for that explicit action; use `outline` for secondary actions and `ghost` for quiet icon controls. Selected, hover, active, disabled, loading, and focus states remain distinguishable without relying on color alone.
- Keep reading content visible until a person explicitly opens AI assistance. Closing the assistant preserves the selected source and scroll position. Utility content such as audio opens from its utility control instead of taking a permanent navigation row.
- File and external-data views label their source and distinguish an editable draft, a saved local state, and a completed remote operation. A preview control never reports a real save or update.
- Knowledge views show the selected vault, folder, and note before its body; imported Obsidian Markdown stays read-only unless a write capability is explicitly available. Spreadsheet views identify the branch, folder, file, and sheet, and keep cell editing separate from SVN refresh.
- Transient panels and dialogs close with Escape and return focus to their trigger. Dense lists preserve keyboard focus visibility, while motion respects reduced-motion preference.

## Component rules

- Reuse the control before restyling one: the [ui-primitives component catalog](../packages/client/ui-primitives/README.md#component-catalog) is the only channel that crosses feature packages, and a deliberate visual difference belongs in a prop there rather than in a second copy ([decision](../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.md)).
- Use CSS Modules and `clsx`; do not add a component library or Tailwind.
- Use `--dsw-alias-*` semantic tokens in feature components. Do not copy static palette values or write literal colors there.
- Keep theme selectors out of feature component CSS. Light/dark overrides belong to the theme owner.
- Pair font sizes with line heights and use the theme typography variables when an existing role matches.
- Keep source text, terminal output, and diff lines unwrapped when their component contract requires column preservation; use the shared scrollbar styles rather than component-specific scrollbar selectors.
- Put presentation in CSS. Inline React styles may pass component-local custom-property values but must not encode theme branches.
- Preserve keyboard focus visibility and reduced-motion behavior when adding transitions or hover-only controls.
- Rounded corners inherit the global superellipse smoothing from ui-theme's `corner-shape.css` on supporting engines. Pair `corner-shape: round` with every full-round `border-radius` (`50%`, `100%`, or a pill radius) so circles and capsules keep circular arcs; the ui-theme corner-shape spec enforces the pairing.
- Elevated surfaces (menus, popovers, modals, panels, floating buttons, the composer) set `border: 0` and take `box-shadow: var(--dsw-elevation-panel)`, `var(--dsw-elevation-prominent)`, or the composer's `var(--dsw-elevation-soft)` (larger blur at lower alpha): the 0.5px hairline stroke is the first shadow layer, and `--dsw-elevation-stroke-color` rebinds or suppresses it per surface or state. Never pair a `--dsw-alias-border-*` border with an lv/elevation shadow — the ui-theme elevation spec rejects the pairing; state-colored borders (warn panels) stay real borders.
- Flat borders and separators that use a neutral `--dsw-alias-border-*` token draw at `0.5px` — buttons, inputs, cards, row dividers, and separators drawn as filled boxes (menu separators, the conversation header seam, markdown `hr`, vertical rails) share the hairline weight, which Chromium paints as one device pixel. Dashed affordances and state-colored borders keep 1px; spinner ring tracks keep their width through the spec's explicit allowlist. The ui-theme elevation spec rejects wider neutral solid borders.
- Clickable artifact links (markdown anchors, prose file mentions, web source and fetch links, produced-file chips, workflow member links) color through `--dsw-alias-link` at `font-weight: 500`, with no underline at rest and a dotted 3px-offset underline on hover/focus. Compact Thinking Markdown keeps tertiary text color and a resting dotted underline ([compact presentation](../.agents/notes/implemented/bug-fix/2026-09-17-thinking-markdown.md)). Text-leading anchors also lead with the ui-primitives `LinkIcon` category glyph riding `currentColor`, which for a well-known external host is that site's own mark instead of the globe; workflow member links and image-only anchors carry no glyph, and tool-row file links keep their grey dotted affordance ([clickable-link Agent Note](../.agents/notes/implemented/feature/2026-09-04-web-clickable-link-styles.md), [known-site mark Agent Note](../.agents/notes/implemented/feature/2026-09-16-known-site-link-marks.md)).

## Changing the system

Add or change a shared token in the owning `ui-theme` sheet, then consume its semantic alias from feature packages. Update the owning package reference when a public styling contract changes. Visual behavior follows the [testing policy](testing.md); the [styling-system Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.md) records framework rationale.
