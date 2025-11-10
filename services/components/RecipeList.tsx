import React, { useState, useMemo } from 'react';
import { useRecipes } from '../context/RecipeContext';
import { Recipe } from '../types';
import RecipeCard from './RecipeCard';
import RecipeModal from './RecipeModal';
import { PlusIcon, XIcon } from './icons';

const RecipeList: React.FC = () => {
  const { recipes, categories, isLoading, error, clearError } = useRecipes();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const handleAddRecipe = () => {
    setSelectedRecipe(null);
    setIsModalOpen(true);
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setIsModalOpen(true);
  };

  const filteredRecipes = useMemo(() => {
    return recipes
      .filter(recipe => {
        const matchesCategory = filterCategory === 'all' || recipe.category === filterCategory;
        const matchesSearch =
          recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.ingredients.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
      });
  }, [recipes, searchTerm, filterCategory]);

  return (
    <div className="relative">
       {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md shadow-md flex justify-between items-center" role="alert">
          <div>
            <p className="font-bold">An error occurred</p>
            <p>{error}</p>
          </div>
          <button onClick={clearError} className="p-1 rounded-full hover:bg-red-200" aria-label="Dismiss error">
            <XIcon className="h-5 w-5 text-red-700"/>
          </button>
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="Search recipes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-2/3 px-4 py-2 rounded-lg bg-surface border border-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="w-full md:w-1/3 px-4 py-2 rounded-lg bg-surface border border-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-center text-secondary">Loading recipes...</p>}
      
      {!isLoading && filteredRecipes.length === 0 && (
        <div className="text-center py-10">
          <p className="text-lg text-secondary">No recipes found.</p>
          <p className="text-sm text-secondary/80">Try adjusting your filters or add a new recipe!</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredRecipes.map(recipe => (
          <RecipeCard key={recipe.id} recipe={recipe} onEdit={() => handleEditRecipe(recipe)} />
        ))}
      </div>

      <button
        onClick={handleAddRecipe}
        className="fixed bottom-6 right-6 bg-primary text-on-primary rounded-full p-4 shadow-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-base transition-transform hover:scale-105"
        aria-label="Add new recipe"
      >
        <PlusIcon className="h-6 w-6" />
      </button>

      {isModalOpen && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default RecipeList;
