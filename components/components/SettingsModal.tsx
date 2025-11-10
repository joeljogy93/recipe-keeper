import React, { useState, useRef, useEffect } from 'react';
import { useRecipes } from '../context/RecipeContext';
import Modal from './Modal';
import Button from './Button';
import { SunIcon, MoonIcon, CheckCircleIcon, XIcon } from './icons';

interface SettingsModalProps {
  onClose: () => void;
  theme: string;
  toggleTheme: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, theme, toggleTheme }) => {
  const { 
    driveConnected, initializeDrive, driveSignOut, isSyncing, syncWithDrive, 
    exportRecipes, importRecipes, categories, addCategory, deleteCategory, error 
  } = useRecipes();
  const [apiKey, setApiKey] = useState(localStorage.getItem('drive_api_key') || '');
  const [clientId, setClientId] = useState(localStorage.getItem('drive_client_id') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [internalError, setInternalError] = useState<string | null>(null);

  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInternalError(error);
  }, [error]);

  const handleConnect = async () => {
    if(apiKey && clientId) {
      await initializeDrive(apiKey, clientId);
    }
  };

  const handlePasswordSet = () => {
    if (password && password === confirmPassword) {
      localStorage.setItem('recipe_keeper_password', password);
      setPasswordError('');
      alert('Password set successfully! The app will lock on next reload.');
    } else {
      setPasswordError("Passwords do not match.");
    }
  };

  const handlePasswordRemove = () => {
     localStorage.removeItem('recipe_keeper_password');
     alert('Password removed.');
  };

  const handleExport = () => {
    const jsonString = exportRecipes();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipes-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        importRecipes(result);
        onClose();
      };
      reader.readAsText(file);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      await addCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  return (
    <Modal onClose={onClose} title="Settings">
      <div className="space-y-6">
        {internalError && 
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{internalError}</span>
            </div>
        }
        {/* Drive Settings */}
        <div className="p-4 border border-secondary/30 rounded-lg">
          <h3 className="font-semibold mb-2 text-on-surface">Google Drive Sync</h3>
          {driveConnected ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-green-600 dark:text-green-400"><CheckCircleIcon className="h-5 w-5"/> Connected</span>
              <Button onClick={driveSignOut} variant="secondary">Sign Out</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full mt-1 input-style" placeholder="Enter Google API Key"/>
              </div>
              <div>
                <label className="text-sm">Client ID</label>
                <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} className="w-full mt-1 input-style" placeholder="Enter Google Client ID"/>
              </div>
              <Button onClick={handleConnect} variant="primary" disabled={!apiKey || !clientId}>Connect</Button>
            </div>
          )}
           {driveConnected && <Button onClick={syncWithDrive} disabled={isSyncing} className="mt-2">{isSyncing ? 'Syncing...' : 'Sync Now'}</Button>}
        </div>

        {/* Category Management */}
        <div className="p-4 border border-secondary/30 rounded-lg">
            <h3 className="font-semibold mb-2 text-on-surface">Manage Categories</h3>
            <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
                <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full input-style" placeholder="New category name"/>
                <Button type="submit" variant="primary">Add</Button>
            </form>
            <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                {categories.map(cat => (
                    <div key={cat} className="flex justify-between items-center bg-surface p-2 rounded">
                        <span className="text-sm">{cat}</span>
                        <button onClick={() => deleteCategory(cat)} className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-800" aria-label={`Delete ${cat}`}>
                            <XIcon className="h-4 w-4 text-red-500"/>
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* Theme Settings */}
        <div className="p-4 border border-secondary/30 rounded-lg flex justify-between items-center">
          <h3 className="font-semibold text-on-surface">Theme</h3>
          <button onClick={toggleTheme} className="p-2 rounded-full bg-secondary/20 hover:bg-secondary/30">
            {theme === 'light' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
          </button>
        </div>

        {/* Password Settings */}
        <div className="p-4 border border-secondary/30 rounded-lg">
          <h3 className="font-semibold mb-2 text-on-surface">Password Lock</h3>
          <div className="space-y-2">
             <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full mt-1 input-style" placeholder="New Password"/>
             <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full mt-1 input-style" placeholder="Confirm Password"/>
             {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
             <div className="flex gap-2">
                <Button onClick={handlePasswordSet} variant="primary" disabled={!password}>Set/Update Password</Button>
                <Button onClick={handlePasswordRemove} variant="danger">Remove Lock</Button>
             </div>
          </div>
        </div>

        {/* Data Backup */}
        <div className="p-4 border border-secondary/30 rounded-lg">
           <h3 className="font-semibold mb-2 text-on-surface">Data Backup</h3>
            <div className="flex gap-2">
              <Button onClick={handleExport} variant="secondary">Export to JSON</Button>
              <Button onClick={handleImportClick} variant="secondary">Import from JSON</Button>
              <input type="file" ref={importFileRef} onChange={handleFileImport} accept=".json" className="hidden"/>
            </div>
        </div>

        <div className="pt-4 flex justify-end">
            <Button onClick={onClose} variant="primary">Close</Button>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
