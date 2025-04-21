import { modeVars } from '@ensdomains/thorin'
import { style } from '@vanilla-extract/css'

// Style definitions for profile preview
export const container = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '2rem',
  margin: '2rem auto',
  maxWidth: '600px',
  backgroundColor: modeVars.color.background,
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
})
export const avatar = style({
  width: '128px',
  height: '128px',
  borderRadius: '50%',
  objectFit: 'cover',
  marginBottom: '1rem',
})
export const nameStyle = style({
  fontSize: '1.5rem',
  fontWeight: 'bold',
  marginBottom: '0.5rem',
  color: modeVars.color.text,
})
export const recordsList = style({
  listStyle: 'none',
  padding: 0,
  margin: 0,
  width: '100%',
})
export const recordItem = style({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '0.5rem 1rem',
  borderBottom: `1px solid ${modeVars.color.border}`,
})
