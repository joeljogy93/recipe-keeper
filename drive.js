// Google Drive helpers (Drive.file scope)
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
export const DRIVE_FOLDER = 'RecipeKeeper';
export const DRIVE_FILE = 'recipes.json';
export const IMAGES_FOLDER = 'images';

export async function gapiInit(clientId, apiKey){
  await new Promise(res => gapi.load('client:auth2', res));
  await gapi.client.init({ apiKey, clientId, discoveryDocs: DISCOVERY, scope: SCOPES });
  return gapi.auth2.getAuthInstance();
}
export async function ensureSignedIn(auth){
  if(!auth.isSignedIn.get()) await auth.signIn();
}

async function findOrCreateFolder(name, parentId){
  const nameEsc = name.replace(/'/g, "\\'");
  const q = parentId
    ? `'${parentId}' in parents and name='${nameEsc}' and trashed=false`
    : `name='${nameEsc}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await gapi.client.drive.files.list({ q, fields:'files(id,name)', spaces:'drive' });
  if(r.result.files?.length) return r.result.files[0].id;
  const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
  if(parentId) meta.parents = [parentId];
  const c = await gapi.client.drive.files.create({ resource: meta, fields:'id' });
  return c.result.id;
}

async function findOrCreateJson(folderId, name, initial){
  const q = `'${folderId}' in parents and name='${name.replace(/'/g,"\\'")}' and trashed=false`;
  const r = await gapi.client.drive.files.list({ q, fields:'files(id,name)' });
  if(r.result.files?.length) return r.result.files[0].id;
  return (await uploadJsonNew(folderId, name, initial)).id;
}

function multipart(metadata, data, contentType){
  const boundary='-------314159265358979323846';
  const d="\r\n--"+boundary+"\r\n";
  const end="\r\n--"+boundary+"--";
  const body = d + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
               d + 'Content-Type: '+(contentType||'application/octet-stream')+'\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
               btoa(data) + end;
  return { body, boundary };
}

async function uploadJsonNew(folderId, name, obj){
  const meta={ name, parents:[folderId] };
  const data = JSON.stringify(obj);
  const { body, boundary } = multipart(meta, data, 'application/json');
  const r = await gapi.client.request({
    path:'/upload/drive/v3/files', method:'POST', params:{ uploadType:'multipart' },
    headers:{ 'Content-Type':'multipart/related; boundary="'+boundary+'"' }, body
  });
  return r.result;
}

async function updateJson(fileId, obj){
  const meta={ name: DRIVE_FILE };
  const data = JSON.stringify(obj);
  const { body, boundary } = multipart(meta, data, 'application/json');
  await gapi.client.request({
    path:'/upload/drive/v3/files/'+fileId, method:'PATCH', params:{ uploadType:'multipart' },
    headers:{ 'Content-Type':'multipart/related; boundary="'+boundary+'"' }, body
  });
}

async function downloadJson(fileId){
  const r = await gapi.client.drive.files.get({ fileId, alt:'media' });
  return r.result;
}

export async function ensureRoots(auth, store){
  await ensureSignedIn(auth);
  const folderId = store.meta.drive?.folderId || await findOrCreateFolder(DRIVE_FOLDER);
  const fileId   = store.meta.drive?.fileId   || await findOrCreateJson(folderId, DRIVE_FILE, store);
  const imagesId = store.meta.drive?.imagesFolderId || await findOrCreateFolder(IMAGES_FOLDER, folderId);
  store.meta.drive = { folderId, fileId, imagesFolderId: imagesId };
  return store.meta.drive;
}

export async function pullMerge(store){
  if(!store.meta.drive?.fileId) return store;
  try{
    const remote = await downloadJson(store.meta.drive.fileId);
    if(remote?.updated && remote.updated > (store.updated||0)) return remote;
    if((store.updated||0) >= (remote?.updated||0)) await updateJson(store.meta.drive.fileId, store);
  }catch(_){}
  return store;
}

export async function push(store){
  if(!store.meta.drive?.fileId) return;
  await updateJson(store.meta.drive.fileId, store);
}

export async function uploadImage(file, store){
  if(!store.meta.drive?.imagesFolderId) throw new Error('Images folder missing');
  const bin = await new Promise((res,rej)=>{ const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.onerror=rej; rd.readAsBinaryString(file); });
  const meta = { name:file.name, parents:[store.meta.drive.imagesFolderId] };
  const boundary='-------314159265358979323846';
  const d="\r\n--"+boundary+"\r\n", end="\r\n--"+boundary+"--";
  const body = d+'Content-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+
               d+'Content-Type: '+(file.type||'application/octet-stream')+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(bin)+end;
  const r = await gapi.client.request({
    path:'/upload/drive/v3/files', method:'POST', params:{ uploadType:'multipart' },
    headers:{ 'Content-Type':'multipart/related; boundary="'+boundary+'"' }, body
  });
  const fileId = r.result.id;
  const perm   = await gapi.client.drive.files.get({ fileId, fields:'id, webViewLink' });
  return { fileId, webViewLink: perm.result.webViewLink, name: file.name };
}

export async function deleteDriveFile(fileId){
  try{ await gapi.client.drive.files.delete({ fileId }) }catch(_){}
}
