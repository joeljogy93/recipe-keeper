/* drive.js — Google Drive sync (keys entered in page, nothing hard-coded) */

const Drive = (() => {
  let tokenClient = null;
  let accessToken = null;
  let gapiReady = false;

  let rootFolderId = null;
  let imagesFolderId = null;
  let recipesFileId = null;

  const FOLDER_NAME = "RecipeKeeper";
  const IMAGES_NAME = "images";
  const RECIPES_NAME = "recipes.json";

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const filesOrEmpty = (res) =>
    (res && res.result && Array.isArray(res.result.files)) ? res.result.files : [];

  async function ensureGapiLoaded() {
    if (gapiReady) return;
    await new Promise(res => gapi.load("client", res));
    gapiReady = true;
  }

  function needToken() {
    if (!accessToken) throw new Error("Not signed in to Drive");
  }

  // ---- INIT ----
  async function init({ clientId, apiKey }) {
    await ensureGapiLoaded();

    await gapi.client.init({
      apiKey,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });

    // ✅ FIX: load Drive API properly
    await gapi.client.load("drive", "v3");

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (resp) => {
        accessToken = resp.access_token;
        gapi.client.setToken({ access_token: accessToken });
      },
    });
  }

  // ---- SIGN IN / OUT ----
  async function signIn() {
    if (!tokenClient) throw new Error("Drive.init() not called");
    return new Promise((resolve, reject) => {
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

  // ---- STRUCTURE ----
  async function ensureStructure() {
    needToken();

    // 1) /RecipeKeeper folder
    let res = await gapi.client.drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
      fields: "files(id,name)"
    });
    const roots = filesOrEmpty(res);

    if (roots.length) rootFolderId = roots[0].id;
    else {
      res = await gapi.client.drive.files.create({
        resource: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
        fields: "id"
      });
      rootFolderId = res.result.id;
    }

    // 2) /RecipeKeeper/images
    res = await gapi.client.drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${IMAGES_NAME}' and trashed=false and '${rootFolderId}' in parents`,
      fields: "files(id,name)"
    });
    const imgs = filesOrEmpty(res);

    if (imgs.length) imagesFolderId = imgs[0].id;
    else {
      res = await gapi.client.drive.files.create({
        resource: { name: IMAGES_NAME, parents: [rootFolderId], mimeType: "application/vnd.google-apps.folder" },
        fields: "id"
      });
      imagesFolderId = res.result.id;
    }

    // 3) /RecipeKeeper/recipes.json
    res = await gapi.client.drive.files.list({
      q: `name='${RECIPES_NAME}' and trashed=false and '${rootFolderId}' in parents`,
      fields: "files(id,name)"
    });
    const recs = filesOrEmpty(res);

    if (recs.length) recipesFileId = recs[0].id;
    else {
      const blob = new Blob([JSON.stringify({ categories: [], recipes: [] }, null, 2)], {
        type: "application/json",
      });
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

    const res = await gapi.client.drive.files.get({
      fileId: recipesFileId,
      alt: "media"
    });

    return res.result || { categories: [], recipes: [] };
  }

  async function saveJSON(obj) {
    needToken();
    if (!recipesFileId) await ensureStructure();

    await gapi.client.request({
      path: "/upload/drive/v3/files/" + recipesFileId,
      method: "PATCH",
      params: { uploadType: "media" },
      body: JSON.stringify(obj, null, 2),
    });
  }

  // ---- IMAGES ----
  async function uploadImage(file) {
    needToken();
    if (!imagesFolderId) await ensureStructure();

    const meta = { name: file.name || ("img_" + Date.now()), parents: [imagesFolderId] };
    const up = await uploadFileMultipart(file, meta);

    try {
      await gapi.client.drive.permissions.create({
        fileId: up.id,
        resource: { role: "reader", type: "anyone" }
      });
    } catch (_) {}

    return { id: up.id, url: `https://drive.google.com/uc?id=${up.id}` };
  }

  // ---- UPLOAD HELPERS ----
  async function uploadBlobMultipart(blob, metadata) {
    const boundary = "----rk" + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\n`,
      `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata) + `\r\n`,
      `--${boundary}\r\n`,
      `Content-Type: ${metadata.mimeType || "application/octet-stream"}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ], { type: "multipart/related; boundary=" + boundary });

    const resp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      { method: "POST", headers: { Authorization: "Bearer " + accessToken }, body }
    );
    if (!resp.ok) throw new Error("Upload failed");
    return await resp.json();
  }

  async function uploadFileMultipart(file, metadata) {
    return uploadBlobMultipart(file, {
      ...metadata,
      mimeType: file.type || "application/octet-stream"
    });
  }

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
