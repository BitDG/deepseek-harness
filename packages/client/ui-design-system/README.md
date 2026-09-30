---
description: "Interactive DSH component catalog, semantic theme swatches, and interface composition examples in Settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-design-system

English | [中文](README.zh.md)

## Summary

Use Settings → UI components to try the shared DSH controls before building a new interface. Inspect button variants, validation, selection, menus, dialogs, output cards, theme swatches and empty/error recovery with fixed sample data. Light and Dark change the application's appearance preference; other sample actions do not execute commands or save files. The page reuses production primitives and adds no model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Web bundle mounts this Client plugin. Open Settings → UI components; the catalog has Controls, Output cards, Visual tokens and Composition tabs. It requires the existing slots, locale and theme services, and waits for the Settings section declaration before contributing its page. There are no configuration fields or Host behaviors.

The catalog's ordinary demonstrations keep state only while mounted. Loading is explicitly started and finished by the sample controls. Output cards carry static paths, commands and results; their copy and folding controls operate on those samples. Theme buttons use the real theme service and persist the preference through its existing settings mechanism.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client entry contributes one locale-owned `settings.section` entry. `ComponentCatalog` receives the framework locale seat and one injected theme callback; all other state is component-local. The page imports shared primitives, never another feature's implementation components. CSS Modules consume semantic tokens; theme ownership remains in ui-theme.

Tab navigation uses Left/Right/Home/End with one active tab stop. The nested sample dialog captures Escape before the outer Settings dialog, wraps Tab within its controls and restores its trigger on dismissal. Its handlers leave on unmount. Dictionary and slot registrations are owned by the plugin fiber. No invariant companion is published because the page owns no independently diverging runtime observations.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Interface design system](../../../docs/ui-design-system.md) — component selection, visual rules, composition and accessibility.
- [Primitive catalog](../ui-primitives/README.md#component-catalog) — complete export and parameter owner.
- [Web styling](../../../docs/web-styling.md) — styling ownership and theme policy.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package renders browser-only component samples and registers nothing model-facing.

#### KV Cache effect

No provider request is generated, so this package does not affect KV-cache reuse.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The interactive samples cover common shared controls and output renderers, not every business-specific UI or onboarding flow. The primitive README is the complete inventory. The catalog does not show resolved numeric values for every token or change the application's layout geometry.

<a id="dev-note"></a>
### Dev Note

None.
