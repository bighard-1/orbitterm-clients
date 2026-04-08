import type { OrbitUiPalette } from '../../theme/orbitTheme';

export type MobileNavTab = 'hosts' | 'sessions' | 'settings';

interface MobileLayoutProps {
  activeTab: MobileNavTab;
  locale: string;
  palette: OrbitUiPalette;
  onTabChange: (tab: MobileNavTab) => void;
}

interface TabItem {
  id: MobileNavTab;
  icon: string;
  label: string;
}

const resolveTabItems = (locale: string): TabItem[] => {
  if (locale === 'zh-TW') {
    return [
      { id: 'hosts', icon: '🧭', label: '資產' },
      { id: 'sessions', icon: '⌨️', label: '會話' },
      { id: 'settings', icon: '⚙️', label: '設定' }
    ];
  }
  if (locale === 'ja-JP') {
    return [
      { id: 'hosts', icon: '🧭', label: 'ホスト' },
      { id: 'sessions', icon: '⌨️', label: 'セッション' },
      { id: 'settings', icon: '⚙️', label: '設定' }
    ];
  }
  if (locale === 'en-US') {
    return [
      { id: 'hosts', icon: '🧭', label: 'Hosts' },
      { id: 'sessions', icon: '⌨️', label: 'Sessions' },
      { id: 'settings', icon: '⚙️', label: 'Settings' }
    ];
  }
  return [
    { id: 'hosts', icon: '🧭', label: '资产' },
    { id: 'sessions', icon: '⌨️', label: '会话' },
    { id: 'settings', icon: '⚙️', label: '设置' }
  ];
};

export function MobileLayout({
  activeTab,
  locale,
  palette,
  onTabChange
}: MobileLayoutProps): JSX.Element {
  const tabItems = resolveTabItems(locale);

  return (
    <nav
      aria-label="Primary navigation"
      className="ot-mobile-nav fixed bottom-2 left-2 right-2 z-[220] grid grid-cols-3 gap-1 rounded-[var(--radius)] border p-1.5 backdrop-blur-xl"
      role="tablist"
      style={{
        borderColor: palette.panelBorder,
        background: palette.panelBackground,
        paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))'
      }}
    >
      {tabItems.map((item) => {
        const active = item.id === activeTab;
        return (
          <button
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            className={`ot-mobile-nav-btn inline-flex min-h-11 flex-col items-center justify-center rounded-[var(--radius)] border px-2 py-2 text-[11px] font-semibold ${
              active ? 'text-white' : 'text-[#d8e8ff]'
            }`}
            key={item.id}
            onClick={() => {
              onTabChange(item.id);
            }}
            role="tab"
            style={
              active
                ? {
                    background: palette.accent,
                    borderColor: palette.accent
                  }
                : {
                    background: 'rgba(255,255,255,0.04)',
                    borderColor: 'rgba(148,163,184,0.25)'
                  }
            }
            type="button"
          >
            <span className="text-sm">{item.icon}</span>
            <span className="mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
