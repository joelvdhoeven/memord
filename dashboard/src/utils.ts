export function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export const TYPE_COLORS: Record<string, string> = {
  preference: '#6366f1',
  project_fact: '#06b6d4',
  constraint: '#ef4444',
  goal: '#f59e0b',
  episodic: '#8b5cf6',
  skill: '#10b981',
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#6b7280';
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    preference: 'Preference', project_fact: 'Project Fact',
    constraint: 'Constraint', goal: 'Goal',
    episodic: 'Episodic', skill: 'Skill',
  };
  return labels[type] ?? type;
}

export function importanceColor(importance: number): string {
  if (importance >= 0.7) return '#10b981';
  if (importance >= 0.4) return '#f59e0b';
  return '#ef4444';
}
