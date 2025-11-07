/* drive.js — Drive sync (keys entered in page, nothing hard-coded) */

const Drive = (() => {
  // ---- state ----
  let tokenClient = null;
  let accessToken = null;
  let gapiReady = false;

  let rootFolderId = null;      // /RecipeKeeper
  let imagesFolderId = null;    // /RecipeKeeper/images
  let recipesFileId = null;     // /RecipeKeeper/recipes.json

  const FOLDER_NAME = "RecipeKeeper";
  const IMAGES_NAME = "images";
  const RECIPES_NAME = "recipes.json";

  // ---- helpers ----
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const filesOrEmpty = (res) => (res && res.result && res.result.files) ? res.result.files : [];

  async function ensureGapiLoaded() {
    if (gapiReady) return;
    await new Promise(res => gapi.load("client", res));
    gapiReady = true;
  }

  function needToken() {
    if (!accessToken) throw new Error("Not signed in");
  }

  // ---- public api ----
  async function init({ clientId, apiKey }) {
    await ensureGapiLoaded();
    await gapi.client.init({
      apiKey,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (resp) => {
        accessToken = resp.access_token;
        // Also set token for gapi client
        gapi.client.setToken({ access_token: accessToken });
      },
    });
  }

  async function signIn() {
    if (!tokenClient) throw new Error("Init not called");
    await new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        if (resp.error) reject(resp);
        else {
          accessToken = resp.access_token;
          gapi.client.setToken({ access_token: accessToken });
          resolve();
        }
      };
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  function signOut() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken);
      accessToken = null;
      gapi.client.setToken(null);
    }
  }

  // ---- structure ----
  async function ensureStructure() {
    needToken();

    // 1) /RecipeKeeper
    let res = await gapi.client.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='" + FOLDER_NAME + "' and trashed=false",
      fields: "files(id,name)"
    });
    const roots = filesOrEmpty(res);
    if (roots.length) {
      rootFolderId = roots[0].id;
    } else {
      res = await gapi.client.drive.files.create({
        resource: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
        fields: "id"
      });
      rootFolderId = res.result.id;
    }

    // 2) /RecipeKeeper/images
    res = await gapi.client.drive.files.list({
      q:
        "mimeType='application/vnd.google-apps.folder' and name='" + IMAGES_NAME + "' and trashed=false and '" +
        rootFolderId + "' in parents",
      fields: "files(id,name)"
    });
    const imgs = filesOrEmpty(res);
    if (imgs.length) {
      imagesFolderId = imgs[0].id;
    } else {
      res = await gapi.client.drive.files.create({
        resource: { name: IMAGES_NAME, parents: [rootFolderId], mimeType: "application/vnd.google-apps.folder" },
        fields: "id"
      });
      imagesFolderId = res.result.id;
    }

    // 3) /RecipeKeeper/recipes.json (create empty if missing)
    res = await gapi.client.drive.files.list({
      q: "name='" + RECIPES_NAME + "' and trashed=false and '" + rootFolderId + "' in parents",
      fields: "files(id,name)"
    });
    const recs = filesOrEmpty(res);
    if (recs.length) {
      recipesFileId = recs[0].id;
    } else {
      const blob = new Blob([JSON.stringify({ categories: [], recipes: [] }, null, 2)], {
        type: "application/json",
      });
      // Create file
      const createRes = await uploadBlobMultipart(blob, {
        name: RECIPES_NAME,
        mimeType: "application/json",
        parents: [rootFolderId],
      });
      recipesFileId = createRes.id;
    }
  }

  // ---- JSON I/O ----
  async function loadJSON() {
    needToken();
    if (!recipesFileId) await ensureStructure();

    // alt=media returns the file content
    const res = await gapi.client.drive.files.get({ fileId: recipesFileId, alt: "media" });
    return res.result || { categories: [], recipes: [] };
  }

  async function saveJSON(obj) {
    needToken();
    if (!recipesFileId) await ensureStructure();

    const body = JSON.stringify(obj, null, 2);
    // Update file content
    await gapi.client.request({
      path: "/upload/drive/v3/files/" + recipesFileId,
      method: "PATCH",
      params: { uploadType: "media" },
      body,
    });
  }

  // ---- Images ----
  async function uploadImage(file) {
    needToken();
    if (!imagesFolderId) await ensureStructure();

    // Upload multipart (metadata + file)
    const meta = { name: file.name || ("img_" + Date.now()), parents: [imagesFolderId] };
    const up = await uploadFileMultipart(file, meta);

    // Make linkable (anyone with link) – allowed for files we created with drive.file scope
    try {
      await gapi.client.drive.permissions.create({
        fileId: up.id,
        resource: { role: "reader", type: "anyone" }
      });
    } catch (_) { /* ignore if fails */ }

    // Public-ish URL (works after permission)
    const url = "https://drive.google.com/uc?id=" + up.id;
    return { id: up.id, url };
  }

  // ---- low-level upload helpers ----
  async function uploadBlobMultipart(blob, metadata) {
    // Build multipart/related body manually with fetch (simpler than gapi upload helpers)
    const boundary = "-------rk" + Math.random().toString(36).slice(2);
    const metaPart = JSON.stringify(metadata);
    const body = new Blob([
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metaPart + '\r\n',
      `--${boundary}\r\n`,
      'Content-Type: ' + (metadata.mimeType || 'application/octet-stream') + '\r\n\r\n',
      blob,
      '\r\n--' + boundary + '--'
    ], { type: 'multipart/related; boundary=' + boundary });

    const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken },
      body
    });
    if (!resp.ok) throw new Error("Image create failed");
    return await resp.json(); // { id }
  }

  async function uploadFileMultipart(file, metadata) {
    return uploadBlobMultipart(file, { ...metadata, mimeType: file.type || "application/octet-stream" });
  }

  // ---- public surface ----
  return {
    init,
    signIn,
    signOut,
    ensureStructure,
    loadJSON,
    saveJSON,
    uploadImage
  };
})();
