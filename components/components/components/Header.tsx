import React, { useState } from 'react';
import { APP_NAME } from '../constants';
import SettingsModal from './SettingsModal';
import { SettingsIcon } from './icons';

interface HeaderProps {
  theme: string;
  toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header className="bg-surface shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">{APP_NAME}</h1>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-surface"
            aria-label="Open settings"
          >
            <SettingsIcon className="h-6 w-6 text-on-surface" />
          </button>
        </div>
      </header>
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}
    </>
  );
};

export default Header;
