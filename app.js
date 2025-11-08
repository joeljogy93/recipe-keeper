/* app.js — UI wiring with Drive status indicator */

(function(){
  // ===== DOM =====
  const lock = $('#lock');
  const app = $('#app');

  const unlockBtn = $('#unlockBtn');
  const setPassBtn = $('#setPassBtn');
  const lockInput = $('#lockInput');
  const lockMsg = $('#lockMsg');

  const settingsDlg = $('#settingsDlg');
  const newPass = $('#newPass');
  const savePassBtn = $('#savePassBtn');
  const closeSettings = $('#closeSettings');

  const themeToggle = $('#themeToggle');

  const clientIdEl = $('#clientId');
  const apiKeyEl = $('#apiKey');
  const connectBtn = $('#connectBtn');
  const signOutBtn = $('#signOutBtn');
  const driveStatus = $('#driveStatus');

  const search = $('#search');
  const categoryFilter = $('#categoryFilter');
  const manageBtn = $('#manageBtn');
  const exportBtn = $('#exportBtn');
  const importFile = $('#importFile');
  const newBtn = $('#newBtn');
  const list = $('#list');

  const recipeDlg = $('#recipeDlg');
  const dlgTitle = $('#dlgTitle');
  const rTitle = $('#rTitle');
  const rCat = $('#rCat');
  const rIngr = $('#rIngr');
  const rNotes = $('#rNotes');
  const rImage = $('#rImage');
  const saveRecipeBtn = $('#saveRecipeBtn');
  const closeRecipeBtn = $('#closeRecipeBtn');
  const recipeMsg = $('#recipeMsg');

  // ===== State =====
  const LS = { PW:"rk_pw", KEYS:"rk_keys", DATA:"rk_data", THEME:"rk_theme" };
  let data = { categories: defaultCats(), recipes: [] };
  let editingId = null;
  let driveReady = false;

  // ===== Utils =====
  function $(q){ return document.querySelector(q); }
  function on(el, ev, fn){ el.addEventListener(ev, fn); }
  function defaultCats(){
    return ["Kerala Non veg","Kerala veg","Dessert","Cakes","Filling",
            "Cookies","Without egg dessert","Without egg cakes","Without egg cookies"];
  }
  function uid(){ return Math.random().toString(36).slice(2,9); }

  // ===== Password (local only) =====
  function getPW(){ return localStorage.getItem(LS.PW)||""; }
  function setPW(pw){ localStorage.setItem(LS.PW, pw||""); }

  function showApp(){ lock.classList.add('hidden'); app.classList.remove('hidden'); renderEverything(); }
  function tryAutoUnlock(){ if(!getPW()){ showApp(); } else { lock.classList.remove('hidden'); app.classList.add('hidden'); } }

  // ===== Theme =====
  function loadTheme(){ const t = localStorage.getItem(LS.THEME)||"light"; document.documentElement.setAttribute("data-theme", t); themeToggle.checked=(t==="dark"); }
  function saveTheme(){ const t = themeToggle.checked?"dark":"light"; document.documentElement.setAttribute("data-theme", t); localStorage.setItem(LS.THEME, t); }

  // ===== Drive connect flow =====
  async function connectDrive(){
    connectBtn.disabled = true;
    driveStatus.textContent = "Initializing…";
    try{
      const keys = { clientId: clientIdEl.value.trim(), apiKey: apiKeyEl.value.trim() };
      if(!keys.clientId || !keys.apiKey) { driveStatus.textContent="Enter Client ID and API Key."; connectBtn.disabled=false; return; }
      localStorage.setItem(LS.KEYS, JSON.stringify(keys));

      await Drive.init(keys);
      driveStatus.textContent = "Requesting access…";
      await Drive.signIn();

      driveStatus.textContent = "Preparing folders…";
      await Drive.ensureStructure();

      driveStatus.textContent = "Loading recipes…";
      const remote = await Drive.loadJSON();
      if(remote && remote.categories && remote.recipes) data = remote;

      driveReady = true;
      driveStatus.textContent = "Connected ✓";
      renderEverything();
    }catch(e){
      driveReady = false;
      driveStatus.textContent = "Error";
      alert("Drive error: " + (e && e.message ? e.message : e));
    }finally{
      connectBtn.disabled = false;
    }
  }

  function signOutDrive(){
    Drive.signOut();
    driveStatus.textContent = "Signed out";
    driveReady = false;
  }

  async function saveAll(){
    localStorage.setItem(LS.DATA, JSON.stringify(data));
    if(driveReady){
      try{
        await Drive.saveJSON(data);
        driveStatus.textContent = "Saved to Drive ✓";
      }catch(e){
        driveStatus.textContent = "Save failed (cached locally)";
      }
    }
  }

  // ===== Data I/O =====
  function loadLocal(){
    try{
      const cached = JSON.parse(localStorage.getItem(LS.DATA)||"null");
      if(cached && cached.categories && cached.recipes) data = cached;
    }catch{}
  }

  // ===== Rendering =====
  function renderCats(){
    const all = ["All", ...data.categories];
    categoryFilter.innerHTML = all.map(c=>`<option value="${c}">${c}</option>`).join("");
    rCat.innerHTML = data.categories.map(c=>`<option value="${c}">${c}</option>`).join("");
  }
  function renderList(){
    const q = (search.value||"").toLowerCase();
    const c = categoryFilter.value||"All";
    const items = data.recipes
      .filter(r => (c==="All" || r.category===c))
      .filter(r => !q || (r.title.toLowerCase().includes(q) || (r.ingredients||"").toLowerCase().includes(q) || (r.notes||"").toLowerCase().includes(q)))
      .sort((a,b)=> (b.updated||0)-(a.updated||0));

    list.innerHTML = items.map(r => `
      <div class="item" data-id="${r.id}">
        <h4>${r.title}</h4>
        <div class="tags">${r.category} · ${new Date(r.updated||Date.now()).toLocaleString()}</div>
        ${r.imageUrl ? `<div class="row" style="margin-top:8px"><img src="${r.imageUrl}" alt="" style="max-width:220px;border-radius:10px;border:1px solid var(--line)"></div>` : ""}
        <div class="ops">
          <button class="btn" data-op="open">Open</button>
          <button class="btn" data-op="edit">Edit</button>
          <button class="btn" data-op="del">Delete</button>
        </div>
      </div>
    `).join("") || `<div class="muted">No recipes yet. Tap “+ New”.</div>`;
  }
  function renderEverything(){ renderCats(); renderList(); }

  // ===== CRUD =====
  function newRecipe(){
    editingId = null;
    dlgTitle.textContent = "New recipe";
    rTitle.value = ""; rCat.value = data.categories[0]||"";
    rIngr.value = ""; rNotes.value = ""; rImage.value = "";
    recipeMsg.textContent = "";
    recipeDlg.showModal();
  }
  function openRecipe(id){
    const r = data.recipes.find(x=>x.id===id);
    if(!r) return;
    alert(`Title: ${r.title}\nCategory: ${r.category}\n\nIngredients:\n${r.ingredients}\n\nNotes:\n${r.notes}`);
  }
  function editRecipe(id){
    const r = data.recipes.find(x=>x.id===id);
    if(!r) return;
    editingId = id;
    dlgTitle.textContent = "Edit recipe";
    rTitle.value = r.title; rCat.value = r.category;
    rIngr.value = r.ingredients; rNotes.value = r.notes;
    rImage.value = ""; recipeMsg.textContent = "";
    recipeDlg.showModal();
  }
  async function saveRecipe(){
    const t = rTitle.value.trim();
    if(!t){ recipeMsg.textContent = "Title required"; return; }

    const item = {
      id: editingId || uid(),
      title: t,
      category: rCat.value,
      ingredients: rIngr.value,
      notes: rNotes.value,
      updated: Date.now()
    };

    if(rImage.files && rImage.files[0]){
      if(driveReady){
        try{
          const up = await Drive.uploadImage(rImage.files[0]);
          item.imageUrl = up.url;
        }catch(e){
          recipeMsg.textContent = "Image upload failed (saving without image)";
        }
      }else{
        item.imageUrl = URL.createObjectURL(rImage.files[0]); // local preview
      }
    }else if(editingId){
      const prev = data.recipes.find(x=>x.id===editingId);
      if(prev && prev.imageUrl) item.imageUrl = prev.imageUrl;
    }

    if(editingId){
      const i = data.recipes.findIndex(x=>x.id===editingId);
      data.recipes[i] = item;
    }else{
      data.recipes.push(item);
    }
    await saveAll();
    recipeDlg.close(); renderList();
  }
  async function deleteRecipe(id){
    if(!confirm("Delete this recipe?")) return;
    data.recipes = data.recipes.filter(x=>x.id!==id);
    await saveAll(); renderList();
  }

  // ===== Export / Import =====
  function exportJSON(){
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "recipes-backup.json"; a.click();
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = async () => {
      try{
        const obj = JSON.parse(reader.result);
        if(!obj || !obj.recipes || !obj.categories) throw new Error("Invalid file");
        data = obj; await saveAll(); renderEverything();
      }catch(e){ alert("Import failed: " + e.message); }
    };
    reader.readAsText(file);
  }

  // ===== Categories =====
  function manageCats(){
    const cur = data.categories.join("\n");
    const next = prompt("Edit categories (one per line):", cur);
    if(next==null) return;
    data.categories = next.split("\n").map(s=>s.trim()).filter(Boolean);
    saveAll(); renderCats();
  }

  // ===== Events =====
  document.addEventListener("DOMContentLoaded", async () => {
    // unlock
    on(unlockBtn, "click", () => {
      if(!getPW() || lockInput.value === getPW()) showApp();
      else lockMsg.textContent = "Wrong password.";
    });
    on(setPassBtn, "click", () => settingsDlg.showModal());
    on(savePassBtn, "click", () => {
      setPW(newPass.value.trim()); newPass.value=""; $('#settingsMsg').textContent="Password saved (this device only).";
      setTimeout(()=>settingsDlg.close(), 600);
    });
    on(closeSettings, "click", () => settingsDlg.close());

    // theme
    loadTheme(); on(themeToggle, "change", saveTheme);

    // prefill keys
    try{
      const saved = JSON.parse(localStorage.getItem(LS.KEYS)||"null");
      if(saved){ clientIdEl.value = saved.clientId||""; apiKeyEl.value = saved.apiKey||""; }
    }catch{}

    // Wire buttons
    on(connectBtn, "click", connectDrive);
    on(signOutBtn, "click", signOutDrive);

    // toolbar
    on(newBtn, "click", newRecipe);
    on(manageBtn, "click", manageCats);
    on(exportBtn, "click", exportJSON);
    on(importFile, "change", e => { if(e.target.files[0]) importJSON(e.target.files[0]); });
    on(search, "input", renderList);
    on(categoryFilter, "change", renderList);

    // list ops
    on(list, "click", (e) => {
      const btn = e.target.closest("[data-op]"); if(!btn) return;
      const id = e.target.closest(".item")?.dataset.id; const op = btn.dataset.op;
      if(op==="open") openRecipe(id);
      if(op==="edit") editRecipe(id);
      if(op==="del") deleteRecipe(id);
    });

    // recipe dialog
    on(saveRecipeBtn, "click", saveRecipe);
    on(closeRecipeBtn, "click", ()=>recipeDlg.close());

    // local data + lock
    loadLocal(); tryAutoUnlock();

    // *** NEW: enable Connect only when gapi loader is ready ***
    driveStatus.textContent = "Loading Google API…";
    try {
      await Drive.whenLoaderReady();
      driveStatus.textContent = "Google API ready. Enter keys, then Connect.";
      connectBtn.disabled = false;
    } catch (e) {
      driveStatus.textContent = "Google API failed to load.";
    }
  });

})();
