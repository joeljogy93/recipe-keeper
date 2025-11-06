/* drive.js – Google Drive helpers (no modules) */

// Public state bag for app.js to use
window.DriveState = {
  gapiLoaded: false,
  authed: false,
  folderId: null,          // RecipeKeeper
  imagesId: null,          // RecipeKeeper/images
  fileId: null,            // recipes.json
  clientId: "",
  apiKey: ""
};

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const APP_FOLDER_NAME = 'RecipeKeeper';
const RECIPES_FILE_NAME = 'recipes.json';
const IMAGES_FOLDER_NAME = 'images';

// Load + init gapi with provided keys
async function driveInit(clientId, apiKey) {
  return new Promise((resolve, reject) => {
    window.gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          apiKey,
          clientId,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          scope: SCOPES
        });
        window.DriveState.gapiLoaded = true;
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function driveSignIn() {
  await gapi.auth2.getAuthInstance().signIn();
  window.DriveState.authed = true;
}

async function driveSignOut() {
  await gapi.auth2.getAuthInstance().signOut();
  window.DriveState.authed = false;
}

// Ensure folder / file structure exists
async function ensureStructure() {
  const folderId = await ensureFolder(APP_FOLDER_NAME, null);             // /RecipeKeeper
  const imagesId = await ensureFolder(IMAGES_FOLDER_NAME, folderId);      // /RecipeKeeper/images
  const fileId   = await ensureFile(RECIPES_FILE_NAME, folderId);         // /RecipeKeeper/recipes.json
  Object.assign(DriveState, { folderId, imagesId, fileId });
}

// Find or create folder with name under parentId (or My Drive if null)
async function ensureFolder(name, parentId) {
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${name.replace(/'/g,"\\'")}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "not 'appDataFolder' in parents"
  ].join(' and ');
  let res = await gapi.client.drive.files.list({ q, fields: 'files(id,name)' });
  if (res.result.files && res.result.files.length) return res.result.files[0].id;

  // Create
  res = await gapi.client.drive.files.create({
    fields: 'id',
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    }
  });
  return res.result.id;
}

// Find or create text file
async function ensureFile(name, parentId) {
  const q = [
    "mimeType != 'application/vnd.google-apps.folder'",
    `name = '${name.replace(/'/g,"\\'")}'`,
    `'${parentId}' in parents`,
    "trashed = false"
  ].join(' and ');
  let res = await gapi.client.drive.files.list({ q, fields: 'files(id,name)' });
  if (res.result.files && res.result.files.length) return res.result.files[0].id;

  // Create an empty recipes.json
  const fileRes = await gapi.client.drive.files.create({
    fields: 'id',
    resource: { name, parents: [parentId], mimeType: 'application/json' }
  });
  const id = fileRes.result.id;
  await uploadString(id, JSON.stringify({ recipes: [], categories: [
    "Kerala Non veg","Kerala veg","Dessert","Cakes","Filling","Cookies",
    "Without egg dessert","Without egg cakes","Without egg cookies"
  ] }, null, 2));
  return id;
}

// Download recipes.json → parsed object
async function downloadRecipes() {
  const res = await gapi.client.drive.files.get({
    fileId: DriveState.fileId,
    alt: 'media'
  });
  const text = res.body || res.result; // gapi varies by platform
  try { return JSON.parse(text); } catch { return { recipes: [], categories: [] }; }
}

// Upload full JSON back
async function uploadRecipes(dataObj) {
  return uploadString(DriveState.fileId, JSON.stringify(dataObj, null, 2));
}

// Helper: upload string content to an existing Drive file
async function uploadString(fileId, str) {
  const body = new Blob([str], { type: 'application/json' });
  return gapi.client.request({
    path: `/upload/drive/v3/files/${fileId}`,
    method: 'PATCH',
    params: { uploadType: 'media' },
    body
  });
}

// Upload image to /images and return webContentLink
async function uploadImage(file) {
  // Create metadata (in images folder)
  const meta = {
    name: file.name || `img_${Date.now()}.jpg`,
    parents: [DriveState.imagesId]
  };

  // Multipart upload
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const reader = await file.arrayBuffer();
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(reader)));
  const contentType = file.type || 'image/jpeg';

  const multipartRequestBody =
    delimiter + 'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(meta) +
    delimiter + 'Content-Type: ' + contentType + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data + closeDelim;

  const res = await gapi.client.request({
    path: '/upload/drive/v3/files',
    method: 'POST',
    params: { uploadType: 'multipart', fields: 'id,webContentLink' },
    headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
    body: multipartRequestBody
  });
  return res.result.webContentLink || "";
}

// Export small API for app.js
window.DriveAPI = {
  driveInit, driveSignIn, driveSignOut, ensureStructure,
  downloadRecipes, uploadRecipes, uploadImage
};
