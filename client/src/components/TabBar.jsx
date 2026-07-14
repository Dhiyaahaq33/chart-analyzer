const TABS = [
  { id: 'crypto', label: 'Crypto', accent: 'var(--amber)', dim: 'var(--amber-dim)' },
  { id: 'forex',  label: 'Forex',  accent: 'var(--blue)',  dim: 'var(--blue-dim)'  },
  { id: 'stocks', label: 'Stocks', accent: 'var(--green)', dim: 'var(--green-dim)' },
];

export default function TabBar({ active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '4px',
    }}>
      {TABS.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              padding: '8px 20px',
              border: 'none',
              borderRadius: '7px',
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
              background: isActive ? tab.dim : 'transparent',
              color: isActive ? tab.accent : 'var(--muted)',
              outline: isActive ? `1px solid ${tab.accent}33` : 'none',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export { TABS };
