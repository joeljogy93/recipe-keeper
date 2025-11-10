import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Recipe } from '../types';
import { driveService } from '../services/driveService';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CATEGORIES } from '../constants';

interface RecipeContextType {
  recipes: Recipe[];
  categories: string[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  driveConnected: boolean;
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>, photoFile?: File) => Promise<void>;
  updateRecipe: (recipe: Recipe, photoFile?: File) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  addCategory: (category: string) => Promise<void>;
  deleteCategory: (category: string) => Promise<void>;
  syncWithDrive: () => Promise<void>;
  driveSignOut: () => void;
  initializeDrive: (apiKey: string, clientId: string) => Promise<void>;
  exportRecipes: () => string;
  importRecipes: (jsonString: string) => void;
  clearError: () => void;
}

const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

export const RecipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);

  const clearError = () => setError(null);

  const loadLocalData = useCallback(() => {
    try {
      const localRecipes = localStorage.getItem('recipes');
      if (localRecipes) {
        setRecipes(JSON.parse(localRecipes));
      }
      const localCategories = localStorage.getItem('categories');
      if (localCategories) {
        setCategories(JSON.parse(localCategories));
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
    } catch (e) {
      setError('Failed to load local data.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocalData();
    if (driveService.isInitialized() && driveService.isSignedIn()) {
        setDriveConnected(true);
    }
  }, [loadLocalData]);

  const saveLocalRecipes = (recipesToSave: Recipe[]) => {
    try {
        const sortedRecipes = [...recipesToSave].sort((a, b) => b.updatedAt - a.updatedAt);
        localStorage.setItem('recipes', JSON.stringify(sortedRecipes));
        setRecipes(sortedRecipes);
    } catch (e) {
        setError('Failed to save recipes locally.');
        console.error(e);
    }
  };
  
  const saveLocalCategories = (categoriesToSave: string[]) => {
    try {
        const sortedCategories = [...categoriesToSave].sort();
        localStorage.setItem('categories', JSON.stringify(sortedCategories));
        setCategories(sortedCategories);
    } catch (e) {
        setError('Failed to save categories locally.');
        console.error(e);
    }
  };

  const syncWithDrive = useCallback(async () => {
    if (!driveService.isSignedIn()) {
        setError("Not connected to Google Drive.");
        return;
    }
    setIsSyncing(true);
    setError(null);
    try {
        // Sync Recipes
        const driveRecipes = await driveService.getRecipes();
        const localRecipes = JSON.parse(localStorage.getItem('recipes') || '[]') as Recipe[];
        const mergedRecipes: Recipe[] = [...localRecipes];
        const localRecipeIds = new Set(localRecipes.map(r => r.id));

        driveRecipes.forEach(driveRecipe => {
            if (!localRecipeIds.has(driveRecipe.id)) {
                mergedRecipes.push(driveRecipe);
            } else {
                const localVersion = mergedRecipes.find(r => r.id === driveRecipe.id)!;
                if (driveRecipe.updatedAt > localVersion.updatedAt) {
                    const index = mergedRecipes.findIndex(r => r.id === driveRecipe.id);
                    mergedRecipes[index] = driveRecipe;
                }
            }
        });
        saveLocalRecipes(mergedRecipes);
        await driveService.saveRecipes(mergedRecipes);

        // Sync Categories
        const driveCategories = await driveService.getCategories();
        const localCategories = JSON.parse(localStorage.getItem('categories') || '[]') as string[];
        const mergedCategories = Array.from(new Set([...localCategories, ...driveCategories])).sort();
        saveLocalCategories(mergedCategories);
        await driveService.saveCategories(mergedCategories);

        console.log("Sync successful");

    } catch (err) {
        setError('Failed to sync with Google Drive.');
        console.error(err);
    } finally {
        setIsSyncing(false);
    }
  }, []);

  const initializeDrive = async (apiKey: string, clientId: string) => {
    setIsLoading(true);
    setError(null);
    try {
        await driveService.init(apiKey, clientId, () => {
             setDriveConnected(driveService.isSignedIn());
        });
        if (driveService.isSignedIn()) {
            setDriveConnected(true);
            await syncWithDrive();
        } else {
             driveService.signIn();
        }
    } catch (err) {
        setError("Failed to initialize Google Drive connection.");
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  };

  const driveSignOut = () => {
    driveService.signOut();
    setDriveConnected(false);
  };

  const addRecipe = async (recipeData: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>, photoFile?: File) => {
    setIsLoading(true);
    setError(null);
    let photoInfo: { photoUrl?: string; photoDriveId?: string } = {};
    if (photoFile && driveConnected) {
        try {
            const { webLink, id } = await driveService.uploadImage(photoFile);
            photoInfo = { photoUrl: webLink, photoDriveId: id };
        } catch (e) {
            setError('Image upload failed. Saving recipe without image.');
            console.error(e);
        }
    }

    const now = Date.now();
    const newRecipe: Recipe = {
        ...recipeData,
        ...photoInfo,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
    };
    
    const updatedRecipes = [...recipes, newRecipe];
    saveLocalRecipes(updatedRecipes);

    if (driveConnected) {
        await driveService.saveRecipes(updatedRecipes).catch(e => {
            setError("Failed to save to Drive.");
            console.error(e);
        });
    }
    setIsLoading(false);
  };

  const updateRecipe = async (updatedRecipe: Recipe, photoFile?: File) => {
    setIsLoading(true);
    setError(null);
    let photoInfo: { photoUrl?: string; photoDriveId?: string } = {
        photoUrl: updatedRecipe.photoUrl,
        photoDriveId: updatedRecipe.photoDriveId,
    };
    
    if (photoFile && driveConnected) {
        try {
            if (updatedRecipe.photoDriveId) {
                await driveService.deleteImage(updatedRecipe.photoDriveId);
            }
            const { webLink, id } = await driveService.uploadImage(photoFile);
            photoInfo = { photoUrl: webLink, photoDriveId: id };
        } catch (e) {
            setError('Image upload failed. Saving recipe without changing image.');
            console.error(e);
        }
    }

    const recipeWithTimestamp: Recipe = {
        ...updatedRecipe,
        ...photoInfo,
        updatedAt: Date.now(),
    };
    
    const updatedRecipes = recipes.map(r => r.id === recipeWithTimestamp.id ? recipeWithTimestamp : r);
    saveLocalRecipes(updatedRecipes);
    
    if (driveConnected) {
        await driveService.saveRecipes(updatedRecipes).catch(e => {
            setError("Failed to save to Drive.");
            console.error(e);
        });
    }
    setIsLoading(false);
  };

  const deleteRecipe = async (id: string) => {
    setError(null);
    const recipeToDelete = recipes.find(r => r.id === id);
    if (!recipeToDelete) return;

    if (driveConnected && recipeToDelete.photoDriveId) {
        try {
            await driveService.deleteImage(recipeToDelete.photoDriveId);
        } catch (e) {
            setError("Failed to delete image from Drive, but deleting recipe locally.");
            console.error(e);
        }
    }

    const updatedRecipes = recipes.filter(r => r.id !== id);
    saveLocalRecipes(updatedRecipes);

    if (driveConnected) {
        await driveService.saveRecipes(updatedRecipes).catch(e => {
            setError("Failed to save deletion to Drive.");
            console.error(e);
        });
    }
  };
  
  const addCategory = async (category: string) => {
    setError(null);
    if (!category || categories.includes(category)) return;
    const updatedCategories = [...categories, category];
    saveLocalCategories(updatedCategories);

    if (driveConnected) {
      await driveService.saveCategories(updatedCategories).catch(e => {
        setError("Failed to save new category to Drive.");
        console.error(e);
      });
    }
  };

  const deleteCategory = async (categoryToDelete: string) => {
    setError(null);
    const isCategoryInUse = recipes.some(r => r.category === categoryToDelete);
    if (isCategoryInUse) {
      setError(`Cannot delete "${categoryToDelete}" as it's in use.`);
      setTimeout(() => setError(null), 4000);
      return;
    }
    const updatedCategories = categories.filter(c => c !== categoryToDelete);
    saveLocalCategories(updatedCategories);

    if (driveConnected) {
      await driveService.saveCategories(updatedCategories).catch(e => {
        setError("Failed to delete category from Drive.");
        console.error(e);
      });
    }
  };

  const exportRecipes = () => {
    return JSON.stringify(recipes, null, 2);
  };

  const importRecipes = (jsonString: string) => {
      setError(null);
      try {
        const imported = JSON.parse(jsonString) as Recipe[];
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        
        const validRecipes = imported.filter(r => r.id && r.title && r.category);
        
        const newCategories = new Set<string>(categories);
        validRecipes.forEach(recipe => {
            if (recipe.category && !newCategories.has(recipe.category)) {
                newCategories.add(recipe.category);
            }
        });

        saveLocalCategories(Array.from(newCategories));
        saveLocalRecipes(validRecipes);

        if(driveConnected) {
            syncWithDrive();
        }
      } catch (e) {
          setError("Failed to import recipes. Invalid JSON file.");
          console.error(e);
      }
  };

  return (
    <RecipeContext.Provider value={{
      recipes,
      categories,
      isLoading,
      isSyncing,
      error,
      driveConnected,
      addRecipe,
      updateRecipe,
      deleteRecipe,
      addCategory,
      deleteCategory,
      syncWithDrive,
      driveSignOut,
      initializeDrive,
      exportRecipes,
      importRecipes,
      clearError
    }}>
      {children}
    </RecipeContext.Provider>
  );
};

export const useRecipes = (): RecipeContextType => {
  const context = useContext(RecipeContext);
  if (context === undefined) {
    throw new Error('useRecipes must be used within a RecipeProvider');
  }
  return context;
};
