import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components'

const useStyles = makeStyles({
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    margin: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    textDecoration: 'none',
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightRegular,
    transition: `background-color ${tokens.durationFast} ${tokens.curveEasyEase}, color ${tokens.durationFast} ${tokens.curveEasyEase}`,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  active: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  icon: {
    fontSize: '20px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
}

export const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => {
  const styles = useStyles()
  const location = useLocation()
  const isActive = location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      className={mergeClasses(styles.link, isActive && styles.active)}
    >
      <span className={styles.icon}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}
