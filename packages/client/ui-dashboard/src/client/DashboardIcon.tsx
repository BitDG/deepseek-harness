/** Sidebar icon for the dashboard page. */
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Render the data glyph at the size requested by the sidebar. */
export function DashboardIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconDataOutline16 size={size} />
}
