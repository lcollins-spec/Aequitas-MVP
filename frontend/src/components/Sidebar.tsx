import { NavLink } from 'react-router-dom';
import {
  Home,
  TrendingUp,
  FileText,
  Map,
  Users,
  FileCheck,
  Gift,
  Building2,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/fund-returns', icon: TrendingUp, label: 'Fund Returns' },
  { to: '/underwriting', icon: FileText, label: 'Underwriting' },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/gp-portfolio', icon: Users, label: 'GP Portfolio' },
  { to: '/regulations', icon: FileCheck, label: 'Regulations' },
  { to: '/grants', icon: Gift, label: 'Grants' },
];

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
        className={`fixed left-0 top-0 h-screen w-60 bg-white border-r border-gray-200 z-40 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 p-4 pt-16 lg:pt-5">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Building2 size={22} className="text-blue-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-gray-800">Aequitas AI</span>
            <span className="text-xs text-gray-500">Underwriting Platform</span>
          </div>
        </div>
        <nav className="flex flex-col py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all border-l-3 ${
                  isActive
                    ? 'bg-blue-50 text-blue-500 border-l-blue-500'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 border-l-transparent'
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
