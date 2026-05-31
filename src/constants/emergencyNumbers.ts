/**
 * Hardcoded India national emergency numbers.
 * Always shown — even when live API data is available.
 * Direct-dial: NO confirmation dialog for these numbers.
 */
export const INDIA_EMERGENCY = [
  {
    id: '1',
    label: 'National Emergency',
    number: '112',
    icon: '🚨',
    color: '#d90429',
    description: 'Police + Ambulance + Fire',
  },
  {
    id: '2',
    label: 'Ambulance',
    number: '108',
    icon: '🚑',
    color: '#2a9d8f',
    description: 'Free emergency ambulance',
  },
  {
    id: '3',
    label: 'Police',
    number: '100',
    icon: '👮',
    color: '#457b9d',
    description: 'Police control room',
  },
  {
    id: '4',
    label: 'Road Accidents',
    number: '1073',
    icon: '🛣️',
    color: '#f77f00',
    description: 'National Highway helpline',
  },
] as const;

export type EmergencyNumber = typeof INDIA_EMERGENCY[number];

/** Numbers that should NEVER show a confirmation dialog */
export const DIRECT_DIAL_NUMBERS = new Set(['112', '108', '100', '1073']);
