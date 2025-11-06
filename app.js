// app.js – Recipe Keeper (Password + Google Drive, single recipes.json)

// ===== Password (local, hashed) =====
const LS_KEY = 'rk_pass_hash_v1';
const sha = async s => {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');
};

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const byId = id => document.getElementById(id);

const UI = {
  lock: byId('lock'),
  lockInput: byId('lockInput'),
  unlockBtn: byId('unlockBtn'),
  setPassBtn: byId('setPassBtn'),
  lockMsg: byId('lockMsg'),

  app: byId('app'),
  darkToggle: byId('darkToggle'),
  clientId: byId('clientId'),
  apiKey: byId('apiKey'),
  connectBtn: byId('connectBtn'),
  signoutBtn: byId('signoutBtn'),
  driveMsg: byId('driveMsg'),

  search: byId('search'),
  newBtn: byId('newBtn'),
  manageBtn: byId('manageBtn'),
  settingsBtn: byId('settingsBtn'),
  list: byId('list'),

  editDlg: byId('editDlg'),
  dlgTitle: byId('dlgTitle'),
  rTitle: byId('rTitle'),
  rCategory: byId('rCategory'),
  rIngr: byId('rIngr'),
  rNotes: byId('rNotes'),
  rImage: byId('rImage'),
  rImagePreview: byId('rImagePreview'),
  saveBtn: byId('saveBtn'),
  deleteBtn: byId('deleteBtn'),
  closeBtn: byId('closeBtn'),
  editMsg: byId('editMsg'),

  catsDlg: byId('catsDlg'),
  catsList: byId('catsList'),
  newCat: byId('newCat'),
  addCatBtn: byId('addCatBtn'),
  closeCats: byId('closeCats'),

  settingsDlg: byId('settingsDlg'),
  newPass: byId('newPass'),
  savePassBtn: byId('savePassBtn'),
  closeSettings: byId('closeSettings'),
  settingsMsg: byId('settingsMsg')
};

// App memory
let data = { recipes: [], categories: [] };
let editingIndex = -1;   // -1 new, else index in data.recipes

// ===== Password flow =====
async function tryUnlock() {
  const hash = localStorage.getItem(LS_KEY);
  if (!hash) { // first time → require set
    UI.lockMsg.textContent = "No password set. Tap 'Set/Change password'.";
    return false;
  }
  const typed = UI.lockInput.value.trim();
  const ok = (await sha(typed)) === hash;
  if (!ok) {
    UI.lockMsg.textContent = "Wrong password.";
    return false;
  }
  UI.lock.classList.add('hidden');
  UI.app.classList.remove('hidden');
  return true;
}

async function setPassword() {
  UI.settingsDlg.showModal();
}

// ===== Drive connect =====
UI.connectBtn?.addEventListener('click', async () => {
  try {
    const clientId = UI.clientId.value.trim();
    const apiKey   = UI.apiKey.value.trim();
    if (!clientId || !apiKey) {
      UI.driveMsg.textContent = "Enter CLIENT_ID and API_KEY.";
      return;
    }
    await DriveAPI.driveInit(clientId, apiKey);
    await DriveAPI.driveSignIn();
    await DriveAPI.ensureStructure();
    data = await DriveAPI.downloadRecipes();
    if (!data.categories) data.categories = [];
    renderCategories();
    renderList();
    UI.driveMsg.textContent = "Connected to Google Drive.";
  } catch (e) {
    UI.driveMsg.textContent = "Drive error: " + (e?.message || e);
  }
});

UI.signoutBtn?.addEventListener('click', async () => {
  await DriveAPI.driveSignOut();
  UI.driveMsg.textContent = "Signed out.";
});

// ===== UI Events =====
UI.unlockBtn?.addEventListener('click', async () => {
  await tryUnlock();
});
UI.setPassBtn?.addEventListener('click', setPassword);

UI.savePassBtn?.addEventListener('click', async () => {
  const v = UI.newPass.value.trim();
  if (!v) { UI.settingsMsg.textContent = "Enter a password"; return; }
  const h = await sha(v);
  localStorage.setItem(LS_KEY, h);
  UI.newPass.value = "";
  UI.settingsMsg.textContent = "Password saved (this device only).";
});
UI.closeSettings?.addEventListener('click', () => UI.settingsDlg.close());

UI.darkToggle?.addEventListener('change', () => {
  document.documentElement.setAttribute('data-theme', UI.darkToggle.checked ? 'dark' : 'light');
  localStorage.setItem('rk_theme', UI.darkToggle.checked ? 'dark' : 'light');
});

UI.newBtn?.addEventListener('click', () => openEditor(-1));
UI.closeBtn?.addEventListener('click', () => UI.editDlg.close());
UI.manageBtn?.addEventListener('click', () => UI.catsDlg.showModal());
UI.closeCats?.addEventListener('click', () => UI.catsDlg.close());
UI.addCatBtn?.addEventListener('click', () => {
  const name = UI.newCat.value.trim();
  if (!name) return;
  if (!data.categories.includes(name)) data.categories.push(name);
  UI.newCat.value = "";
  renderCategories();
  persist(); // save categories change
});
UI.catsList?.addEventListener('click', (e) => {
  if (e.target.tagName !== 'LI') return;
  const name = e.target.dataset.name;
  data.categories = data.categories.filter(c => c !== name);
  renderCategories();
  persist();
});

UI.search?.addEventListener('input', renderList);
UI.rImage?.addEventListener('change', async () => {
  const f = UI.rImage.files?.[0];
  if (!f) return (UI.rImagePreview.classList.add('hidden'), UI.rImagePreview.src="");
  UI.rImagePreview.src = URL.createObjectURL(f);
  UI.rImagePreview.classList.remove('hidden');
});

UI.saveBtn?.addEventListener('click', saveRecipe);
UI.deleteBtn?.addEventListener('click', deleteRecipe);

// ===== Render =====
function renderCategories() {
  // populate select
  UI.rCategory.innerHTML = "";
  data.categories.forEach(c => {
    const o = document.createElement('option'); o.value = o.textContent = c;
    UI.rCategory.appendChild(o);
  });
  // show chips
  UI.catsList.innerHTML = "";
  data.categories.forEach(c => {
    const li = document.createElement('li');
    li.textContent = c; li.dataset.name = c;
    UI.catsList.appendChild(li);
  });
}

function renderList() {
  const q = (UI.search.value || "").toLowerCase();
  const items = (data.recipes || []).filter(r => {
    const hay = `${r.title} ${r.category} ${r.ingredients?.join(' ')} ${r.notes}`.toLowerCase();
    return hay.includes(q);
  });
  UI.list.innerHTML = "";
  if (!items.length) { UI.list.innerHTML = `<div class="muted small">No recipes yet.</div>`; return; }
  items.forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'card-item';
    const img = document.createElement('img');
    img.src = r.imageUrl || '';
    img.alt = r.title || 'photo';
    card.appendChild(img);
    const pad = document.createElement('div'); pad.className='pad';
    pad.innerHTML = `<b>${r.title||''}</b><div class="muted small">${r.category||''}</div>`;
    card.appendChild(pad);
    card.addEventListener('click', () => openEditor(idx, r));
    UI.list.appendChild(card);
  });
}

function openEditor(index, r) {
  editingIndex = index;
  UI.dlgTitle.textContent = index === -1 ? "New recipe" : "Edit recipe";
  UI.rTitle.value = r?.title || "";
  UI.rCategory.value = r?.category || (data.categories[0] || "");
  UI.rIngr.value = (r?.ingredients || []).join('\n');
  UI.rNotes.value = r?.notes || "";
  if (r?.imageUrl) { UI.rImagePreview.src = r.imageUrl; UI.rImagePreview.classList.remove('hidden'); }
  else { UI.rImagePreview.classList.add('hidden'); UI.rImagePreview.src=""; }
  UI.deleteBtn.style.display = (index === -1) ? 'none' : 'inline-block';
  UI.editMsg.textContent = "";
  UI.editDlg.showModal();
}

// ===== Persist (Drive) =====
async function persist() {
  try {
    await DriveAPI.uploadRecipes(data);
  } catch (e) {
    console.error(e);
  }
}

// ===== Save/Delete =====
async function saveRecipe() {
  try {
    const rec = {
      title: UI.rTitle.value.trim(),
      category: UI.rCategory.value,
      ingredients: UI.rIngr.value.split('\n').map(s=>s.trim()).filter(Boolean),
      notes: UI.rNotes.value.trim(),
      imageUrl: null
    };
    // Image upload (full resolution per your choice)
    const file = UI.rImage.files?.[0];
    if (file) {
      UI.editMsg.textContent = "Uploading image…";
      rec.imageUrl = await DriveAPI.uploadImage(file);
    } else if (editingIndex !== -1) {
      // keep existing
      rec.imageUrl = data.recipes[editingIndex].imageUrl || null;
    }

    if (editingIndex === -1) data.recipes.unshift(rec);
    else data.recipes[editingIndex] = rec;

    await persist();
    UI.editMsg.textContent = "Saved.";
    UI.editDlg.close();
    renderList();
  } catch (e) {
    UI.editMsg.textContent = "Save failed: " + (e?.message || e);
  }
}

async function deleteRecipe() {
  if (editingIndex === -1) return UI.editDlg.close();
  if (!confirm('Delete this recipe?')) return;
  data.recipes.splice(editingIndex, 1);
  await persist();
  UI.editDlg.close();
  renderList();
}

// ===== Boot =====
(function boot(){
  // theme
  const t = localStorage.getItem('rk_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  UI.darkToggle.checked = (t === 'dark');

  // lock screen always shows first; user taps Unlock
  UI.lock.classList.remove('hidden');

  // For a new device with no password, guide the user
  if (!localStorage.getItem(LS_KEY)) {
    UI.lockMsg.textContent = "No password set yet. Tap 'Set/Change password' to create one.";
  }
})();
