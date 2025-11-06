/* Recipe Keeper (GitHub Pages + Google Drive, per-recipe files) */

// ---- Keys / helpers
const PASS_KEY = 'rk_local_pass_plain_v1';        // local-only password
const META_KEY = 'rk_meta_v1';                    // clientId, apiKey, drive IDs, categories
const DEFAULT_CATS = [
  "Kerala Non veg","Kerala veg","Dessert","Cakes","Filling","Cookies",
  "Without egg dessert","Without egg cakes","Without egg cookies"
];
const DISCOVERY = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

const $ = id => document.getElementById(id);
const els = {
  lock: $('lock'), lockInput: $('lockInput'), unlockBtn: $('unlockBtn'),
  setPassBtn: $('setPassBtn'), lockMsg: $('lockMsg'), lockTitle: $('lockTitle'),

  settingsDlg: $('settingsDlg'), newPass: $('newPass'), savePassBtn: $('savePassBtn'),
  closeSettings: $('closeSettings'), settingsBtn: $('settingsBtn'), settingsMsg: $('settingsMsg'),

  q: $('q'), addBtn: $('addBtn'), list: $('list'), editor: $('editor'), formTitle: $('formTitle'),
  catBar: $('catBar'), manageCatsBtn: $('manageCatsBtn'), catDlg: $('catDlg'),
  newCatName: $('newCatName'), addCatBtn: $('addCatBtn'), catList: $('catList'), closeCatDlg: $('closeCatDlg'),

  themeToggle: $('themeToggle'), syncStatus: $('syncStatus'),
  driveSetupCard: $('driveSetupCard'), clientId: $('clientId'), apiKey: $('apiKey'),
  connectBtn: $('connectBtn'), signOutBtn: $('signOutBtn'), driveMsg: $('driveMsg'),

  imgInput: $('imgInput'), uploadImgBtn: $('uploadImgBtn'), uploadStatus: $('uploadStatus'),
  preview: $('preview')
};
const fields = { title:$('title'), category:$('category'), prep:$('prep'), ingredients:$('ingredients'), steps:$('steps'), notes:$('notes') };

const esc=s=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const attr=s=>esc(s).replace(/"/g,'&quot;');
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const setStatus=t=>els.syncStatus.textContent=t;

// ---- Theme (auto; toggle saves choice)
(function(){
  const saved=localStorage.getItem('rk_theme');
  if(saved){ document.documentElement.setAttribute('data-theme',saved); els.themeToggle.checked=(saved==='dark'); }
  els.themeToggle.addEventListener('change',()=>{
    const t=els.themeToggle.checked?'dark':'light';
    document.documentElement.setAttribute('data-theme',t);
    localStorage.setItem('rk_theme',t);
  });
})();

// ---- Password (local only)
function hasPass(){ return !!localStorage.getItem(PASS_KEY) }
function setPass(p){ if(!p){localStorage.removeItem(PASS_KEY)} else localStorage.setItem(PASS_KEY,p) }
function tryUnlock(p){ const s=localStorage.getItem(PASS_KEY); if(!s) return true; if(!p) return false; return s.trim()===p.trim() }
function showLock(on){ els.lock.classList.toggle('hidden',!on) }

// ---- Meta store (clientId, apiKey, drive IDs, categories)
function getMeta(){
  try{ const m=JSON.parse(localStorage.getItem(META_KEY)||'{}');
    if(!m.categories || !m.categories.length) m.categories=[...DEFAULT_CATS];
    return m;
  }catch{ return {categories:[...DEFAULT_CATS]} }
}
function setMeta(m){ localStorage.setItem(META_KEY, JSON.stringify(m)) }
function getCats(){ return getMeta().categories }
function setCats(c){ const m=getMeta(); m.categories=c; setMeta(m); renderCatsUI() }

// ---- Google API / Drive
let auth=null;
async function gapiInit(clientId, apiKey){
  await new Promise(res=>gapi.load('client:auth2',res));
  await gapi.client.init({ apiKey, clientId, discoveryDocs:DISCOVERY, scope:SCOPE });
  return gapi.auth2.getAuthInstance();
}
async function ensureSignedIn(a){ if(!a.isSignedIn.get()) await a.signIn() }
async function findOrCreateFolder(name, parentId){
  const q = `'${parentId||'root'}' in parents and name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await gapi.client.drive.files.list({ q, fields:'files(id,name)' });
  if(r.result.files?.length) return r.result.files[0].id;
  const meta = { name, mimeType:'application/vnd.google-apps.folder', parents:[parentId||'root'] };
  const c = await gapi.client.drive.files.create({ resource: meta, fields:'id' });
  return c.result.id;
}
function mp(metadata, dataStr, contentType){
  const b='-------314159265358979323846', d="\r\n--"+b+"\r\n", end="\r\n--"+b+"--";
  const body = d+'Content-Type: application/json\r\n\r\n'+JSON.stringify(metadata)+
               d+'Content-Type: '+(contentType||'application/json')+'\r\n\r\n'+dataStr+end;
  return { body, boundary: b };
}
async function createJsonFile(parentId, name, obj){
  const {body,boundary}=mp({name,parents:[parentId]}, JSON.stringify(obj),'application/json');
  const r=await gapi.client.request({ path:'/upload/drive/v3/files', method:'POST', params:{uploadType:'multipart'},
    headers:{'Content-Type':'multipart/related; boundary="'+boundary+'"'}, body });
  return r.result.id;
}
async function updateJsonFile(fileId, obj){
  const {body,boundary}=mp({name:'recipe.json'}, JSON.stringify(obj),'application/json');
  await gapi.client.request({ path:'/upload/drive/v3/files/'+fileId, method:'PATCH', params:{uploadType:'multipart'},
    headers:{'Content-Type':'multipart/related; boundary="'+boundary+'"'}, body });
}
async function downloadJson(fileId){ const r=await gapi.client.drive.files.get({ fileId, alt:'media' }); return r.result }
async function uploadImageTo(imagesFolderId, file){
  const bin=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsBinaryString(file) });
  const meta={ name:file.name, parents:[imagesFolderId] };
  const b='-------314159265358979323846', d="\r\n--"+b+"\r\n", end="\r\n--"+b+"--";
  const body=d+'Content-Type: application/json\r\n\r\n'+JSON.stringify(meta)+
             d+'Content-Type: '+(file.type||'application/octet-stream')+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(bin)+end;
  const r=await gapi.client.request({ path:'/upload/drive/v3/files', method:'POST', params:{uploadType:'multipart'},
    headers:{'Content-Type':'multipart/related; boundary="'+b+'"'}, body });
  const fileId=r.result.id;
  const metaGet=await gapi.client.drive.files.get({ fileId, fields:'id, webViewLink' });
  return { fileId, webViewLink: metaGet.result.webViewLink, name:file.name };
}
async function deleteFile(fileId){ try{ await gapi.client.drive.files.delete({ fileId }) }catch(_){} }

// ---- Recipes (per-file)
async function listRecipeFiles(){
  const m=getMeta(); if(!m.recipesId) return [];
  const r=await gapi.client.drive.files.list({
    q:`'${m.recipesId}' in parents and mimeType='application/json' and trashed=false`,
    fields:'files(id,name,modifiedTime)', orderBy:'modifiedTime desc', pageSize:200
  });
  return r.result.files||[];
}
async function loadRecipe(id){ try{ return await downloadJson(id) }catch{ return null } }

async function refreshList(){
  setStatus('Loading…');
  const files=await listRecipeFiles();
  const items=[];
  for(const f of files){
    const r=await loadRecipe(f.id);
    if(r){ r._fileId=f.id; items.push(r) }
  }
  renderList(items);
  setStatus('Online');
}

function recipeCard(r){
  const img=(r.images&&r.images[0]&&r.images[0].webViewLink)
    ? `<img alt="" src="${attr(r.images[0].webViewLink)}" style="width:100%;height:160px;object-fit:cover;border:1px solid var(--stroke);border-radius:12px">`
    : '';
  return `<article class="recipe">
    ${img}
    <h3>${esc(r.title||'(no title)')}</h3>
    <div class="muted small">${esc(r.category||'')} • ${r.prep?esc(r.prep)+' • ':''}${new Date(r.updated||Date.now()).toLocaleDateString()}</div>
    <div class="muted small">${esc((r.ingredients||'').split('\n').filter(Boolean).slice(0,3).join(' | '))}</div>
    <div class="actions">
      <button class="btn" onclick="editRecipe('${attr(r._fileId)}')">Edit</button>
      <button class="btn warn" onclick="deleteRecipe('${attr(r._fileId)}')">Delete</button>
    </div>
  </article>`;
}

function renderList(data){
  const q=(els.q.value||'').toLowerCase().trim();
  const cat=window._catSelected||'All';
  const filtered=(data||[]).filter(r=>{
    const ok=(cat==='All'||r.category===cat);
    const text=[r.title||'',r.ingredients||'',r.steps||'',r.notes||''].join('\n').toLowerCase();
    return ok && (!q || text.includes(q));
  });
  els.list.innerHTML = filtered.length ? filtered.map(recipeCard).join('') : '<div class="card muted">No recipes yet. Add one.</div>';
}

// ---- Categories
function renderCatsUI(){
  const cats=['All',...getCats()];
  els.catBar.innerHTML=cats.map(c=>`<span class="pill ${c===(window._catSelected||'All')?'active':''}" onclick="selectCat('${attr(c)}')">${esc(c)}</span>`).join('');
  fields.category.innerHTML=getCats().map(c=>`<option value="${attr(c)}">${esc(c)}</option>`).join('');
  if(!window._catSelected) window._catSelected='All';
}
window.selectCat=name=>{ window._catSelected=name; renderCatsUI(); refreshList() }

async function buildUsage(){
  const files=await listRecipeFiles(); const items=[];
  for(const f of files){ const r=await loadRecipe(f.id); if(r){ items.push(r) } }
  const u={}; getCats().forEach(c=>u[c]=0); items.forEach(r=>{ if(r.category&&u[r.category]!=null) u[r.category]++ }); return u;
}
function refreshCatListDom(u){
  const cats=getCats();
  els.catList.innerHTML=cats.map((c,i)=>{
    const used=(u[c]||0)>0; const dis=used?'disabled':''; const tip=used?` title="Used by ${u[c]} recipe(s)"`:'';
    return `<div class="wrap"><div class="grow">${esc(c)}</div>
      <button class="btn" ${dis} ${tip} onclick="renameCat(${i})">Rename</button>
      <button class="btn warn" ${dis} ${tip} onclick="deleteCat(${i})">Delete</button></div>`;
  }).join('');
}
window.renameCat=async i=>{ const cats=getCats(); const u=await buildUsage(); if((u[cats[i]]||0)>0) return alert('In use');
  const name=prompt('New name:',cats[i]); if(!name) return; if(cats.includes(name)) return alert('Already exists'); cats[i]=name.trim(); setCats(cats); refreshCatListDom(await buildUsage()); };
window.deleteCat=async i=>{ const cats=getCats(); const u=await buildUsage(); if((u[cats[i]]||0)>0) return alert('In use'); if(!confirm('Delete category?')) return; cats.splice(i,1); setCats(cats); refreshCatListDom(await buildUsage()); };
els.manageCatsBtn.onclick=async()=>{ refreshCatListDom(await buildUsage()); els.catDlg.showModal() };
els.closeCatDlg.onclick=()=>els.catDlg.close();

// ---- Editor
let currentFileId=null;
function openEditor(){ els.editor.classList.remove('hidden'); window.scrollTo({top:els.editor.offsetTop-8,behavior:'smooth'}) }
function closeEditor(){ els.editor.classList.add('hidden') }
function clearForm(){
  currentFileId=null;
  fields.title.value=fields.prep.value=fields.ingredients.value=fields.steps.value=fields.notes.value='';
  const cats=getCats(); if(cats.length) fields.category.value=cats[0];
  els.formTitle.textContent='New recipe';
  window._editingImages=[]; updatePreview();
}
function updatePreview(){
  const title=fields.title.value || '(no title)';
  els.preview.innerHTML=`<h3 style="margin:6px 0 2px">${esc(title)}</h3>
    <div class="muted small">${esc(fields.category.value||'')} • ${fields.prep.value?esc(fields.prep.value)+' • ':''}Preview</div>
    <h4>Ingredients</h4><div class="muted small">${esc(fields.ingredients.value).replace(/\n/g,'<br>')||'<i>None</i>'}</div>
    <h4>Steps</h4><div class="muted small">${esc(fields.steps.value).replace(/\n/g,'<br>')||'<i>None</i>'}</div>`;
}
window.editRecipe=async fileId=>{
  const r=await loadRecipe(fileId); if(!r) return alert('Failed to load recipe');
  currentFileId=fileId;
  els.formTitle.textContent='Edit recipe';
  fields.title.value=r.title||''; fields.category.value=r.category||getCats()[0]||'';
  fields.prep.value=r.prep||''; fields.ingredients.value=r.ingredients||'';
  fields.steps.value=r.steps||''; fields.notes.value=r.notes||'';
  window._editingImages=r.images||[];
  openEditor(); updatePreview();
};
window.deleteRecipe=async fileId=>{ if(!confirm('Delete this recipe file from Drive?')) return; await deleteFile(fileId); await refreshList(); };

async function saveRecipe(){
  const m=getMeta(); if(!m.recipesId) return alert('Connect Google Drive first.');
  const recipe={
    title:fields.title.value.trim()||'(untitled)',
    category:fields.category.value,
    prep:fields.prep.value.trim(),
    ingredients:fields.ingredients.value.trim(),
    steps:fields.steps.value.trim(),
    notes:fields.notes.value.trim(),
    images:(window._editingImages||[]),
    updated:Date.now()
  };
  if(currentFileId){ await updateJsonFile(currentFileId, recipe); }
  else{
    const safe=recipe.title.replace(/[^\w\- ]+/g,'').slice(0,60);
    currentFileId=await createJsonFile(m.recipesId, `${safe || 'recipe'} ${uid()}.json`, recipe);
  }
  clearForm(); closeEditor(); await refreshList();
}

// ---- Images
els.uploadImgBtn.onclick=()=>{ const m=getMeta(); if(!m.imagesId) return alert('Connect Google Drive first.'); els.imgInput.click() };
els.imgInput.addEventListener('change', async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  const m=getMeta(); els.uploadStatus.textContent='Uploading…';
  try{
    await ensureSignedIn(auth);
    const info=await uploadImageTo(m.imagesId,file);
    (window._editingImages||(window._editingImages=[])).push(info);
    els.uploadStatus.textContent='Added';
    updatePreview();
  }catch(err){ alert('Upload failed: '+(err.message||err)) }
  finally{ setTimeout(()=>els.uploadStatus.textContent='',1200); e.target.value='' }
});

// ---- Export / Import (local backup of meta + nothing sensitive)
$('exportBtn').onclick=()=>{
  const blob=new Blob([localStorage.getItem(META_KEY)||'{}'],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='recipe-keeper-meta.json'; a.click(); URL.revokeObjectURL(a.href);
};
$('importFile').addEventListener('change',e=>{
  const f=e.target.files?.[0]; if(!f) return; const r=new FileReader();
  r.onload=ev=>{ try{ const obj=JSON.parse(ev.target.result); if(obj.categories) setMeta({...getMeta(), ...obj}); renderCatsUI(); }catch(err){ alert('Import failed: '+err.message) } };
  r.readAsText(f); e.target.value='';
});

// ---- Connect & init
async function connectAndLoad(){
  try{
    els.driveMsg.textContent=''; setStatus('Connecting…');
    const m=getMeta();
    m.clientId=(els.clientId.value.trim()||m.clientId||'');
    m.apiKey=(els.apiKey.value.trim()||m.apiKey||'');
    setMeta(m);

    auth=await gapiInit(m.clientId,m.apiKey);
    await ensureSignedIn(auth);

    const rootId   = m.rootId   || await findOrCreateFolder('RecipeKeeper');
    const recipesId= m.recipesId|| await findOrCreateFolder('recipes',rootId);
    const imagesId = m.imagesId || await findOrCreateFolder('images', rootId);
    setMeta({...m, rootId, recipesId, imagesId});

    els.driveSetupCard.classList.add('hidden');
    setStatus('Online');
    await refreshList();
  }catch(err){
    els.driveMsg.textContent='Connect error: '+(err.message||err);
    setStatus('Offline');
  }
}

// ---- Wire UI
function wire(){
  // Lock UI
  if(!hasPass()){
    els.lockTitle.textContent='Set a password for this device';
    els.lockInput.placeholder='Create a new password';
  }
  showLock(true);

  els.unlockBtn.onclick=()=>{
    const pass=els.lockInput.value.trim();
    if(tryUnlock(pass)){
      els.lockMsg.textContent=''; els.lockInput.value=''; showLock(false);
      // ensure UI visible after unlock
      els.driveSetupCard.classList.remove('hidden');
      renderCatsUI();
    }else{
      els.lockMsg.textContent='Wrong password.';
    }
  };
  els.setPassBtn.onclick=()=>els.settingsDlg.showModal();
  els.savePassBtn.onclick=()=>{ const p=els.newPass.value.trim(); if(!p){ els.settingsMsg.textContent='Password cannot be empty.'; return } setPass(p); els.settingsMsg.textContent='Password saved (this device only).'; els.newPass.value=''; els.lockMsg.textContent='Password set. Use Unlock.'; };
  els.closeSettings.onclick=()=>els.settingsDlg.close();
  els.settingsBtn.onclick=()=>els.settingsDlg.showModal();

  // Drive
  els.connectBtn.onclick=connectAndLoad;
  els.signOutBtn.onclick=async()=>{ try{ const a=gapi.auth2.getAuthInstance(); if(a) await a.signOut() }catch(_){} els.driveSetupCard.classList.remove('hidden'); setStatus('Offline') };

  // Editor / list
  els.addBtn.onclick=()=>{ clearForm(); openEditor() };
  $('saveBtn').onclick=saveRecipe;
  $('cancelBtn').onclick=()=>{ clearForm(); closeEditor() };
  Object.values(fields).forEach(el=>el.addEventListener('input',updatePreview));
  els.q.addEventListener('input',()=>refreshList());

  // Categories
  renderCatsUI();
  els.manageCatsBtn.onclick=async()=>{ refreshCatListDom(await buildUsage()); els.catDlg.showModal() };

  // Fill saved meta (if any)
  const m=getMeta();
  if(m.clientId) els.clientId.value=m.clientId;
  if(m.apiKey)   els.apiKey.value=m.apiKey;

  // Online status
  setStatus(navigator.onLine?'Online':'Offline');
  window.addEventListener('online',()=>setStatus('Online'));
  window.addEventListener('offline',()=>setStatus('Offline'));
}
wire();
