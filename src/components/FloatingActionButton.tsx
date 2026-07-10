'use client';

import React, { useState } from 'react';
import { Search, Star, Plus, X } from 'lucide-react';

interface FloatingActionButtonProps {
  onSearch: () => void;
  onQuickFavorite: () => void;
  onAddStock: () => void;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onSearch,
  onQuickFavorite,
  onAddStock
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleAction = (action: () => void) => {
    action();
    setIsExpanded(false);
  };

  return (
    <div className="fab-container">
      {/* Quick action buttons */}
      {isExpanded && (
        <>
          <button
            className="fab-action fab-search"
            onClick={() => handleAction(onSearch)}
            aria-label="Quick search"
          >
            <Search size={20} />
            <span className="fab-tooltip">Search</span>
          </button>
          
          <button
            className="fab-action fab-favorite"
            onClick={() => handleAction(onQuickFavorite)}
            aria-label="Quick favorite"
          >
            <Star size={20} />
            <span className="fab-tooltip">Favorites</span>
          </button>
          
          <button
            className="fab-action fab-add"
            onClick={() => handleAction(onAddStock)}
            aria-label="Add stock"
          >
            <Plus size={20} />
            <span className="fab-tooltip">Add Stock</span>
          </button>
        </>
      )}

      {/* Main FAB button */}
      <button
        className={`fab-main ${isExpanded ? 'expanded' : ''}`}
        onClick={toggleExpanded}
        aria-label={isExpanded ? 'Close quick actions' : 'Open quick actions'}
      >
        {isExpanded ? <X size={24} /> : <Plus size={24} />}
      </button>
    </div>
  );
}; 