/* drive.js — robust Google Drive module with visible readiness
   - No keys in code. You type Client ID + API Key in the UI.
   - Connect button stays disabled until Drive is ready to use.
*/

const Drive = (() => {
  // ---- internal state ----
  let gapiReady = false;
  let tokenClient = null;
  let accessToken = null;

  let rootFolderId = null;
  let imagesFolderId = null;
  let recipesFileId = null;

  const FOLDER_NAME  = "RecipeKeeper";
  const IMAGES_NAME  = "images";
  const RECIPES_NAME = "recipes.json";

  // small helpers
  const filesOr = (res) => (res && res.result && Array.isArray(res.result.files)) ? res.result.files : [];
  const ok      = (x) => x !== undefined && x !== null;

  // ---- boot sequence (called automatically by this file) ----
  let readyResolvers = [];
  let errorResolvers = [];

  function signalReady()  { gapiReady = true; readyResolvers.splice(0).forEach(fn => fn()); }
  function signalError(e) { errorResolvers.splice(0).forEach(fn => fn(e)); }

  // Start loading gapi when the page loads
  window.addEventListener("load", () => {
    // gapi.js is async; wait for its global to exist, then load "client"
    const tick = setInterval(() => {
      if (window.gapi && window.gapi.load) {
        clearInterval(tick);
        window.gapi.load("client", () => {
          signalReady();  // "client" loader is available; real init happens in init()
        });
      }
    }, 50);
    // If nothing after 10s, surface error
    setTimeout(() => { if (!gapiReady) signalError(new Error("Google API failed to load.")); }, 10000);
  });

  /** wait for the loader to exist (enables the Connect button) */
  function whenLoaderReady() {
    if (gapiReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      readyResolvers.push(resolve);
      errorResolvers.push(reject);
    });
  }

  // ---- public: initialize client with user keys ----
  async function init({ clientId, apiKey }) {
    await whenLoaderReady();

    // Initialize base client
    await gapi.client.init({
      apiKey,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });

    // Ensure Drive v3 is loaded (some mobile browsers need this explicitly)
    if (!ok(gapi.client.drive)) {
      await gapi.client.load("drive", "v3");
    }

    // Prepare OAuth token client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (resp) => {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          gapi.client.setToken({ access_token: accessToken });
        }
      },
    });
  }

  // ---- public: sign in / out ----
  function signIn() {
    if (!tokenClient) throw new Error("Drive not initialized");
    return new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        if (resp && resp.error) reject(resp.error);
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

  function assertAuthed() {
    if (!accessToken) throw new Error("Not signed in to Drive");
  }

  // ---- ensure folder structure ----
  async function ensureStructure() {
    assertAuthed();

    // 1) /RecipeKeeper
    let res = await gapi.client.drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
      fields: "files(id,name)"
    });
    const root = filesOr(res);
    if (root.length) {
      rootFolderId = root[0].id;
    } else {
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
    const imgs = filesOr(res);
    if (imgs.length) {
      imagesFolderId = imgs[0].id;
    } else {
      res = await gapi.client.drive.files.create({
        resource: { name: IMAGES_NAME, mimeType: "application/vnd.google-apps.folder", parents: [rootFolderId] },
        fields: "id"
      });
      imagesFolderId = res.result.id;
    }

    // 3) /RecipeKeeper/recipes.json
    res = await gapi.client.drive.files.list({
      q: `name='${RECIPES_NAME}' and trashed=false and '${rootFolderId}' in parents`,
      fields: "files(id,name)"
    });
    const recs = filesOr(res);
    if (recs.length) {
      recipesFileId = recs[0].id;
    } else {
      const created = await uploadBlobMultipart(
        new Blob([JSON.stringify({ categories: [], recipes: [] }, null, 2)], { type: "application/json" }),
        { name: RECIPES_NAME, parents: [rootFolderId], mimeType: "application/json" }
      );
      recipesFileId = created.id;
    }
  }

  // ---- JSON I/O ----
  async function loadJSON() {
    assertAuthed();
    if (!recipesFileId) await ensureStructure();
    const res = await gapi.client.drive.files.get({ fileId: recipesFileId, alt: "media" });
    return res && res.result ? res.result : { categories: [], recipes: [] };
  }

  async function saveJSON(obj) {
    assertAuthed();
    if (!recipesFileId) await ensureStructure();
    await gapi.client.request({
      path: "/upload/drive/v3/files/" + recipesFileId,
      method: "PATCH",
      params: { uploadType: "media" },
      body: JSON.stringify(obj, null, 2),
    });
  }

  // ---- images ----
  async function uploadImage(file) {
    assertAuthed();
    if (!imagesFolderId) await ensureStructure();

    const meta = { name: file.name || ("img_" + Date.now()), parents: [imagesFolderId], mimeType: file.type || "image/*" };
    const result = await uploadFileMultipart(file, meta);

    // make it public (ignore failures)
    try {
      await gapi.client.drive.permissions.create({
        fileId: result.id,
        resource: { role: "reader", type: "anyone" }
      });
    } catch (_) {}

    return { id: result.id, url: `https://drive.google.com/uc?id=${result.id}` };
  }

  // ---- upload helpers ----
  async function uploadBlobMultipart(blob, metadata) {
    const boundary = "----rk_" + Math.random().toString(36).slice(2);
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

  function uploadFileMultipart(file, metadata) {
    return uploadBlobMultipart(file, metadata);
  }

  // expose
  return {
    whenLoaderReady,  // used by app.js to enable the button
    init,
    signIn,
    signOut,
    ensureStructure,
    loadJSON,
    saveJSON,
    uploadImage
  };
})();
