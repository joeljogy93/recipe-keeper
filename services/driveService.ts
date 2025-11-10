import { Recipe } from '../types';
import { DRIVE_FOLDER_NAME, DRIVE_IMAGES_FOLDER_NAME, DRIVE_RECIPES_FILENAME, DRIVE_CATEGORIES_FILENAME } from '../constants';

// Since gapi and google are loaded from script tags, we need to declare them on the window object
declare global {
  interface Window {
    gapi: any;
    google: any;
    tokenClient: any;
  }
}

class DriveService {
  private gapi: any;
  private gis: any;
  private tokenClient: any;
  private apiKey: string | null = null;
  private clientId: string | null = null;
  private initialized = false;
  private signedIn = false;

  public async init(apiKey: string, clientId: string, updateSigninStatus: (isSignedIn: boolean) => void): Promise<void> {
    this.apiKey = apiKey;
    this.clientId = clientId;
    localStorage.setItem('drive_api_key', apiKey);
    localStorage.setItem('drive_client_id', clientId);

    await new Promise<void>((resolve, reject) => {
      this.gapi = window.gapi;
      this.gis = window.google;

      if (!this.gapi || !this.gis) {
         // Poll for gapi and gis
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            this.gapi = window.gapi;
            this.gis = window.google;
            if(this.gapi && this.gis) {
                clearInterval(interval);
                this.loadClients(updateSigninStatus).then(resolve).catch(reject);
            }
            if(attempts > 20) { // 10 seconds timeout
                clearInterval(interval);
                reject(new Error("Google API scripts failed to load."));
            }
        }, 500);
      } else {
        this.loadClients(updateSigninStatus).then(resolve).catch(reject);
      }
    });
  }
  
  private loadClients(updateSigninStatus: (isSignedIn: boolean) => void): Promise<void> {
    return new Promise((resolve) => {
        this.gapi.load('client', async () => {
            await this.gapi.client.init({
                apiKey: this.apiKey,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            });

            this.tokenClient = this.gis.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: (tokenResponse: any) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        this.gapi.client.setToken(tokenResponse);
                        this.signedIn = true;
                        updateSigninStatus(true);
                    } else {
                        console.error('Invalid token response:', tokenResponse);
                         this.signedIn = false;
                        updateSigninStatus(false);
                    }
                },
            });
            this.initialized = true;
            resolve();
        });
    });
  }

  public isInitialized(): boolean {
      return this.initialized;
  }

  public isSignedIn(): boolean {
      return this.signedIn;
  }

  public signIn() {
    if (this.gapi.client.getToken() === null) {
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      this.tokenClient.requestAccessToken({ prompt: '' });
    }
  }

  public signOut() {
    const token = this.gapi.client.getToken();
    if (token !== null) {
      this.gis.accounts.oauth2.revoke(token.access_token);
      this.gapi.client.setToken('');
      this.signedIn = false;
    }
  }

  private async findOrCreateFolder(name: string, parentId: string = 'root'): Promise<string> {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
    const response = await this.gapi.client.drive.files.list({ q });
    if (response.result.files.length > 0) {
      return response.result.files[0].id;
    }
    const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
    const createResponse = await this.gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
    return createResponse.result.id;
  }

  private async getAppFolderId(): Promise<string> {
    return this.findOrCreateFolder(DRIVE_FOLDER_NAME);
  }

  private async getImagesFolderId(appFolderId: string): Promise<string> {
    return this.findOrCreateFolder(DRIVE_IMAGES_FOLDER_NAME, appFolderId);
  }

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const q = `name='${name}' and '${parentId}' in parents and trashed=false`;
    const response = await this.gapi.client.drive.files.list({ q, fields: 'files(id)' });
    return response.result.files.length > 0 ? response.result.files[0].id : null;
  }

  public async getRecipes(): Promise<Recipe[]> {
    const appFolderId = await this.getAppFolderId();
    const fileId = await this.findFile(DRIVE_RECIPES_FILENAME, appFolderId);
    if (!fileId) return [];
    const response = await this.gapi.client.drive.files.get({ fileId, alt: 'media' });
    return JSON.parse(response.body);
  }

  public async saveRecipes(recipes: Recipe[]): Promise<void> {
    const appFolderId = await this.getAppFolderId();
    let fileId = await this.findFile(DRIVE_RECIPES_FILENAME, appFolderId);
    const content = JSON.stringify(recipes, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const fileMetadata = { name: DRIVE_RECIPES_FILENAME, mimeType: 'application/json', parents: fileId ? undefined : [appFolderId] };
    
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    formData.append('file', blob);

    const path = fileId 
      ? `/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : '/upload/drive/v3/files?uploadType=multipart';
    
    await this.gapi.client.request({
      path,
      method: fileId ? 'PATCH' : 'POST',
      body: formData,
    });
  }

  public async getCategories(): Promise<string[]> {
    const appFolderId = await this.getAppFolderId();
    const fileId = await this.findFile(DRIVE_CATEGORIES_FILENAME, appFolderId);
    if (!fileId) return [];
    const response = await this.gapi.client.drive.files.get({ fileId, alt: 'media' });
    return JSON.parse(response.body);
  }

  public async saveCategories(categories: string[]): Promise<void> {
    const appFolderId = await this.getAppFolderId();
    let fileId = await this.findFile(DRIVE_CATEGORIES_FILENAME, appFolderId);
    const content = JSON.stringify(categories, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const fileMetadata = { name: DRIVE_CATEGORIES_FILENAME, mimeType: 'application/json', parents: fileId ? undefined : [appFolderId] };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    formData.append('file', blob);
    
    const path = fileId 
      ? `/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : '/upload/drive/v3/files?uploadType=multipart';

    await this.gapi.client.request({
      path,
      method: fileId ? 'PATCH' : 'POST',
      body: formData,
    });
  }

  public async uploadImage(file: File): Promise<{ webLink: string, id: string }> {
    const appFolderId = await this.getAppFolderId();
    const imagesFolderId = await this.getImagesFolderId(appFolderId);
    
    const fileMetadata = { name: `${Date.now()}-${file.name}`, parents: [imagesFolderId] };
    
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    formData.append('file', file);
    
    const response = await this.gapi.client.request({
        path: '/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink',
        method: 'POST',
        body: formData,
    });

    const fileId = response.result.id;

    await this.gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: { role: 'reader', type: 'anyone' }
    });
    
    // The webContentLink needs the API key to be accessible directly
    const directLink = `${response.result.webContentLink}&key=${this.apiKey}`;
    return { webLink: directLink, id: fileId };
  }

  public async deleteImage(fileId: string): Promise<void> {
    await this.gapi.client.drive.files.delete({ fileId });
  }
}

export const driveService = new DriveService();
