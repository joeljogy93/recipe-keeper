export interface Recipe {
  id: string;
  title: string;
  category: string;
  ingredients: string;
  notes: string;
  photoUrl?: string;
  photoDriveId?: string;
  createdAt: number;
  updatedAt: number;
}
