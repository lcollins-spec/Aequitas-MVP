import { NavLink } from 'react-router-dom';
import {
  Home,
  TrendingUp,
  FileText,
  Search,
  Users,
  FileCheck,
  Building2,
  Menu,
  X,
  BarChart3,
  Briefcase,
  LayoutDashboard,
  Radar,
  Landmark,
} from 'lucide-react';
import { useState } from 'react';
import GlobalUploadDealButton from './GlobalUploadDealButton';

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/fund-returns', icon: TrendingUp, label: 'Fund Returns' },
  { to: '/underwriting', icon: FileText, label: 'Underwriting' },
  { to: '/deal-execution', icon: Briefcase, label: 'Deal Execution' },
  { to: '/asset-management', icon: LayoutDashboard, label: 'Asset Management' },
  { to: '/pipeline', icon: Search, label: 'Pipeline' },
  { to: '/sourcing', icon: Radar, label: 'Sourcing' },
  { to: '/funders', icon: Landmark, label: 'Funders' },
  { to: '/market-analysis', icon: BarChart3, label: 'Market Analysis' },
  { to: '/gp-portfolio', icon: Users, label: 'GP Portfolio' },
  { to: '/regulations', icon: FileCheck, label: 'Legislation and Government Funding' },
] as const;

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow-md"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-48 bg-brandPurple-700 z-40 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 p-4 pt-16 lg:pt-5">
          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
            <Building2 size={22} className="text-primary-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-heading text-white">Aequitas AI</span>
            <span className="text-xs text-white/60">Underwriting Platform</span>
          </div>
        </div>
        <GlobalUploadDealButton onBeforeOpen={() => setIsOpen(false)} />
        <nav className="flex flex-col py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all border-l-3 ${
                  isActive
                    ? 'bg-white/10 text-primary-400 border-l-primary-400'
                    : 'text-white/70 hover:bg-white/10 hover:text-white border-l-transparent'
                }`
              }
            >
              <item.icon size={20} className="flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
