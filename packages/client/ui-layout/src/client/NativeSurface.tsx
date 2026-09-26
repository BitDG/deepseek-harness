/** Native columns shared by the standard frame and alternative shell presentations. */
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'

type NativeProps = FactoryComponentPropsOf<'shell.native'>

/** Only the main occurrence subscribes to panel navigation. */
function MainPanel({ usePanelInfo, renderSlot }: Pick<NativeProps, 'usePanelInfo' | 'renderSlot'>) {
  const panelId = usePanelInfo(info => info.activePanelId)
  return renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })
}

/** Each occurrence renders one native column while the factory owns its slot declarations. */
export function NativeSurface({ surface, sidebar, rightbar, renderSlot, usePanelInfo }: FactoryComponentPropsOf<'shell.native'>) {
  const render = {
    sidebar: () => renderSlot('sidebar', sidebar),
    main: () => <MainPanel usePanelInfo={usePanelInfo} renderSlot={renderSlot} />,
    rightbar: () => renderSlot('rightbar', rightbar),
    overlays: () => renderSlot('shell.overlay', {}),
  }
  return render[surface]()
}
