'use client';

import { useState, useEffect, useRef } from 'react';

interface FloatingMenuProps {
  onInventoryClick: () => void;
  onContainerClick: () => void;
}

export function FloatingMenu({ onInventoryClick, onContainerClick }: FloatingMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={menuRef}
      className="fixed right-4 bottom-6 z-50 flex flex-col-reverse items-center gap-3"
    >
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center
          text-xl font-bold
          transition-all duration-300
          ${isOpen
            ? 'bg-muted text-foreground rotate-45'
            : 'bg-primary text-primary-foreground hover:opacity-90'}
        `}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      </button>

      {/* Expandable Menu Items */}
      <div className={`
        flex flex-col items-center gap-3
        transition-all duration-300 ease-out
        ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}>
        {/* Inventory Button */}
        <button
          onClick={() => {
            setIsOpen(false);
            onInventoryClick();
          }}
          className="
            w-12 h-12 rounded-full shadow-lg
            bg-card border-2 border-border
            flex items-center justify-center
            text-muted-foreground hover:text-foreground hover:border-foreground
            transition-colors
          "
          title="Inventory"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </button>

        {/* Add Container Button */}
        <button
          onClick={() => {
            setIsOpen(false);
            onContainerClick();
          }}
          className="
            w-12 h-12 rounded-full shadow-lg
            bg-card border-2 border-border
            flex items-center justify-center
            text-muted-foreground hover:text-foreground hover:border-foreground
            transition-colors
          "
          title="Add Container"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
