import React, { useState } from 'react';
import { APP_NAME } from '../constants';
import Button from './Button';

interface PasswordModalProps {
  onUnlock: () => void;
}

const PasswordModal: React.FC<PasswordModalProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = localStorage.getItem('recipe_keeper_password');
    if (password === storedPassword) {
      onUnlock();
    } else {
      setError('Incorrect password.');
    }
  };

  return (
    <div className="fixed inset-0 bg-base flex items-center justify-center z-50">
      <div className="bg-surface p-8 rounded-lg shadow-2xl w-full max-w-sm">
        <h2 className="text-2xl font-bold text-center mb-2 text-on-surface">{APP_NAME}</h2>
        <p className="text-center text-secondary mb-6">Enter password to unlock</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-surface border border-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <Button type="submit" className="w-full mt-4" variant="primary">Unlock</Button>
        </form>
      </div>
    </div>
  );
};

export default PasswordModal;
