'use client';

import React from 'react';
import { Home, Star, Calendar, BarChart3, PieChart } from 'lucide-react';

interface BottomNavigationProps {
  activeSection: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';
  onSectionChange: (section: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks') => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeSection,
  onSectionChange
}) => {
  const navItems = [
    {
      id: 'heatmap' as const,
      label: 'Heatmap',
      icon: BarChart3,
      color: 'text-blue-600'
    },
    {
      id: 'portfolio' as const,
      label: 'Portfolio',
      icon: PieChart,
      color: 'text-purple-600'
    },
    {
      id: 'favorites' as const,
      label: 'Favorites',
      icon: Star,
      color: 'text-yellow-600'
    },
    {
      id: 'earnings' as const,
      label: 'Earnings',
      icon: Calendar,
      color: 'text-green-600'
    },
    {
      id: 'allStocks' as const,
      label: 'All Stocks',
      icon: BarChart3,
      color: 'text-indigo-600'
    }
  ];

  return (
    <nav className="bottom-navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`nav-item ${isActive ? 'active' : ''}`}
            aria-label={item.label}
          >
            <Icon 
              className={`nav-icon ${isActive ? item.color : 'text-gray-500'}`} 
              size={24} 
            />
            <span className={`nav-label ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
              {item.label}
            </span>
            {isActive && <div className="active-indicator" />}
          </button>
        );
      })}
    </nav>
  );
}; 