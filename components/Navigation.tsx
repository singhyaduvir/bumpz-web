"use client";

export type AppTab = "rate" | "map" | "mine";

const tabs: { id: AppTab; label: string; icon: string }[] = [
  { id: "rate", label: "Rate", icon: "＋" },
  { id: "map", label: "Map", icon: "⌖" },
  { id: "mine", label: "My roads", icon: "▣" },
];

export function Navigation({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <>
      <nav className="desktop-nav" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button key={tab.id} className="nav-button" aria-current={active === tab.id ? "page" : undefined} onClick={() => onChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <nav className="tabbar" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button key={tab.id} className="tab-button" aria-current={active === tab.id ? "page" : undefined} onClick={() => onChange(tab.id)}>
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
