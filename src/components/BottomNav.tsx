import { Home, Star, Zap, Camera } from 'lucide-react';

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export default function BottomNav({ currentTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'shortlist', label: 'Shortlist', icon: Star },
    { id: 'scan', label: 'Scan', icon: Camera },
    { id: 'floor', label: 'Floor', icon: Zap },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-900/90 backdrop-blur-xl border-t border-surface-500/30 safe-area-bottom">
      <div className="flex justify-around items-center h-16">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 ${
                isActive ? 'text-electric' : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <div className={`relative ${isActive ? 'glow-sm' : ''}`}>
                <Icon size={22} strokeWidth={isActive ? 2 : 1.5} />
              </div>
              <span className={`text-xs mt-1.5 font-medium tracking-wide ${isActive ? 'text-electric' : ''}`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute bottom-3 w-1 h-1 rounded-full bg-electric" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
