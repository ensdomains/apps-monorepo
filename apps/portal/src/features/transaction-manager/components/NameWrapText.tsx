import { Fragment } from 'react'
import { splitAfterLabelDots } from '../utils/splitAfterLabelDots'

// Lets any ENS name in the text wrap after its dots instead of mid label.
export const NameWrapText = ({ text }: { readonly text: string }) => {
  const segments = splitAfterLabelDots(text)

  return segments.map((segment, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: segments are static and can repeat
    <Fragment key={index}>
      {segment}
      {index < segments.length - 1 && <wbr />}
    </Fragment>
  ))
}
