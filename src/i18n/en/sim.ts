import type { sim as viSim } from '../vi/sim'

export const sim: typeof viSim = {
  panelTitle: 'Simulator controls',
  collapse: 'Collapse',
  expand: 'Open simulator controls',
  speedLabel: 'Speed',
  pause: 'Pause',
  simTimeLabel: 'Sim time',
  seedLabel: 'Seed',
  applySeed: 'Apply',
  copyLink: 'Copy link',
  copied: 'Copied!',
  autoApproveBoss: 'Auto-approve for boss after 2 min (demo)',
  scenariosTitle: 'Scenarios',
  perfGroupTitle: 'Performance test',
  scenarios: {
    angry_refund: 'Angry customer refund',
    sale_1212: '12.12 sale campaign',
    month_end: 'Month-end accounting',
    long_queue: 'Long review queue',
    hire_temps: 'Hire temporary staff',
    team_offline: 'Team offline',
    boss_telegram: 'Boss messages on Telegram',
    crowded: 'Crowded building (80)',
  },
}
