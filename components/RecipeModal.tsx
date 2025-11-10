import React, { useState, useRef } from 'react';
import { useRecipes } from '../context/RecipeContext';
import { Recipe } from '../types';
import Modal from './Modal';
import Button from './Button';

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
}

const RecipeModal: React.FC<RecipeModalProps> = ({ recipe, onClose }) => {
  const { addRecipe, updateRecipe, deleteRecipe, isLoading, categories } = useRecipes();
  const [title, setTitle] = useState(recipe?.title || '');
  const [category, setCategory] = useState<string>(recipe?.category || (categories.length > 0 ? categories[0] : ''));
  const [ingredients, setIngredients] = useState(recipe?.ingredients || '');
  const [notes, setNotes] = useState(recipe?.notes || '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recipe) {
      await updateRecipe({ ...recipe, title, category, ingredients, notes }, photoFile || undefined);
    } else {
      await addRecipe({ title, category, ingredients, notes }, photoFile || undefined);
    }
    onClose();
  };
  
  const handleDelete = async () => {
    if (recipe && window.confirm(`Are you sure you want to delete "${recipe.title}"?`)) {
      await deleteRecipe(recipe.id);
      onClose();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
    }
  };

  return (
    <Modal onClose={onClose} title={recipe ? 'Edit Recipe' : 'Add Recipe'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-on-surface/80">Title</label>
          <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-surface border border-secondary/50 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" />
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-on-surface/80">Category</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-surface border border-secondary/50 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm">
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ingredients" className="block text-sm font-medium text-on-surface/80">Ingredients</label>
          <textarea id="ingredients" value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={5} required className="mt-1 block w-full px-3 py-2 bg-surface border border-secondary/50 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" placeholder="1 cup flour&#10;2 large eggs..."></textarea>
        </div>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-on-surface/80">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="mt-1 block w-full px-3 py-2 bg-surface border border-secondary/50 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"></textarea>
        </div>
        <div>
           <label className="block text-sm font-medium text-on-surface/80">Photo</label>
           <input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="mt-1 block w-full text-sm text-on-surface/80 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"/>
            {photoFile && <p className="text-xs mt-1 text-secondary">{photoFile.name}</p>}
            {recipe?.photoUrl && !photoFile && <img src={recipe.photoUrl} alt="Current" className="mt-2 h-24 w-auto rounded"/>}
        </div>
        <div className="flex justify-between items-center pt-4">
          <div>
            {recipe && <Button onClick={handleDelete} variant="danger" type="button" disabled={isLoading}>Delete</Button>}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="secondary" type="button">Cancel</Button>
            <Button type="submit" variant="primary" disabled={isLoading}>{isLoading ? 'Saving...' : 'Save Recipe'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default RecipeModal;
