import React, { useState, useEffect, useMemo } from 'react';
import { RecipeProvider } from './context/RecipeContext';
import RecipeList from './components/RecipeList';
import Header from './components/Header';
import PasswordModal from './components/PasswordModal';

const App: React.FC = () => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [isLocked, setIsLocked] = useState(!!localStorage.getItem('recipe_keeper_password'));

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const handleUnlock = () => {
    setIsLocked(false);
  };

  const mainContent = useMemo(() => (
    <RecipeProvider>
      <div className="min-h-screen bg-base text-on-surface transition-colors duration-300">
        <Header theme={theme} toggleTheme={toggleTheme} />
        <main className="container mx-auto p-4 md:p-6">
          <RecipeList />
        </main>
      </div>
    </RecipeProvider>
  ), [theme, toggleTheme]);

  if (isLocked) {
    return <PasswordModal onUnlock={handleUnlock} />;
  }

  return mainContent;
};

export default App;
