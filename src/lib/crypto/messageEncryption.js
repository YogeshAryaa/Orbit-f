const enc=new TextEncoder(),dec=new TextDecoder();const toB64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const packJwk=j=>toB64(enc.encode(JSON.stringify(j)));const unpackJwk=s=>JSON.parse(dec.decode(fromB64(s)));const randomId=()=>crypto.randomUUID();
async function exportPublic(k){return packJwk(await crypto.subtle.exportKey('jwk',k));}
async function importEcdhPublic(v){return crypto.subtle.importKey('jwk',unpackJwk(v),{name:'ECDH',namedCurve:'P-256'},true,[]);}
async function importEcdsaPublic(v){return crypto.subtle.importKey('jwk',unpackJwk(v),{name:'ECDSA',namedCurve:'P-256'},true,['verify']);}
async function deriveWrappingKey(privateKey,publicKey,salt){const shared=await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},privateKey,256);const material=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:enc.encode('chat-e2ee-v1-content-key-wrap')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function createDeviceKeyMaterial(deviceId=randomId(),prekeyCount=30){const identity=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const signed=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);const signedPreKeyPublic=await exportPublic(signed.publicKey);const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,enc.encode(signedPreKeyPublic));const oneTimePreKeys=[],privateOneTimePreKeys={};for(let i=0;i<prekeyCount;i++){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);const keyId=randomId();oneTimePreKeys.push({keyId,publicKey:await exportPublic(pair.publicKey)});privateOneTimePreKeys[keyId]=await crypto.subtle.exportKey('jwk',pair.privateKey);}return {publicRegistration:{deviceId,identityPublicKey:await exportPublic(identity.publicKey),signedPreKeyPublic,signedPreKeySignature:toB64(signature),oneTimePreKeys},privateJwks:{deviceId,identityPrivateKey:await crypto.subtle.exportKey('jwk',identity.privateKey),signedPreKeyPrivateKey:await crypto.subtle.exportKey('jwk',signed.privateKey),oneTimePreKeys:privateOneTimePreKeys}};}
export async function verifyBundleSignature(bundle){const identity=await importEcdsaPublic(bundle.identityPublicKey);return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},identity,fromB64(bundle.signedPreKeySignature),enc.encode(bundle.signedPreKeyPublic));}
export async function encryptMessage(plaintext,senderDeviceId,bundles){if(!Array.isArray(bundles)||!bundles.length)throw new Error('No recipient device key bundles supplied');for(const b of bundles)if(!(await verifyBundleSignature(b)))throw new Error(`Invalid signed prekey signature for device ${b.deviceId}`);const contentKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);const nonce=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},contentKey,enc.encode(plaintext));const raw=await crypto.subtle.exportKey('raw',contentKey);const recipientEnvelopes=[];for(const b of bundles){const oneTime=b.oneTimePreKey;const recipientPublic=await importEcdhPublic(oneTime?.publicKey||b.signedPreKeyPublic);const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);const salt=crypto.getRandomValues(new Uint8Array(16));const wrap=await deriveWrappingKey(ephemeral.privateKey,recipientPublic,salt);const keyNonce=crypto.getRandomValues(new Uint8Array(12));const encryptedKey=await crypto.subtle.encrypt({name:'AES-GCM',iv:keyNonce},wrap,raw);recipientEnvelopes.push({recipientDeviceId:b.deviceId,oneTimePreKeyId:oneTime?.keyId||null,ephemeralPublicKey:await exportPublic(ephemeral.publicKey),salt:toB64(salt),keyNonce:toB64(keyNonce),encryptedKey:toB64(encryptedKey)});}return {version:1,algorithm:'ECDH-P256-HKDF-SHA256-AES256GCM',nonce:toB64(nonce),ciphertext:toB64(ciphertext),senderDeviceId,recipientEnvelopes};}

export async function decryptMessage(payload,deviceId,privateJwks){
  if(payload?.version!==1||payload?.algorithm!=='ECDH-P256-HKDF-SHA256-AES256GCM')throw new Error('Unsupported encrypted message format');
  
  // 1. Try envelope for this device
  let env=payload.recipientEnvelopes?.find(e=>e.recipientDeviceId===deviceId);
  if(!env&&privateJwks?.deviceId&&privateJwks.deviceId!==deviceId){
    env=payload.recipientEnvelopes?.find(e=>e.recipientDeviceId===privateJwks.deviceId);
  }

  if(env){
    try{
      const one=env.oneTimePreKeyId&&privateJwks.oneTimePreKeys?.[env.oneTimePreKeyId];
      const jwk=one?privateJwks.oneTimePreKeys[env.oneTimePreKeyId]:privateJwks.signedPreKeyPrivateKey;
      if(jwk){
        const priv=await crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
        const ep=await importEcdhPublic(env.ephemeralPublicKey);
        const wrap=await deriveWrappingKey(priv,ep,fromB64(env.salt));
        const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(env.keyNonce)},wrap,fromB64(env.encryptedKey));
        const ck=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
        const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(payload.nonce)},ck,fromB64(payload.ciphertext));
        if(one)delete privateJwks.oneTimePreKeys[env.oneTimePreKeyId];
        return dec.decode(clear);
      }
    }catch{}
  }

  // 2. Fallback: try ANY recipient envelope with available private key material
  // This allows another device of the same account to decrypt all previous chat history!
  if(Array.isArray(payload.recipientEnvelopes)){
    for(const candidate of payload.recipientEnvelopes){
      if(candidate===env)continue;
      try{
        const one=candidate.oneTimePreKeyId&&privateJwks.oneTimePreKeys?.[candidate.oneTimePreKeyId];
        const jwk=one?privateJwks.oneTimePreKeys[candidate.oneTimePreKeyId]:privateJwks.signedPreKeyPrivateKey;
        if(!jwk)continue;
        const priv=await crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
        const ep=await importEcdhPublic(candidate.ephemeralPublicKey);
        const wrap=await deriveWrappingKey(priv,ep,fromB64(candidate.salt));
        const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(candidate.keyNonce)},wrap,fromB64(candidate.encryptedKey));
        const ck=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
        const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(payload.nonce)},ck,fromB64(payload.ciphertext));
        if(one)delete privateJwks.oneTimePreKeys[candidate.oneTimePreKeyId];
        return dec.decode(clear);
      }catch{}
    }
  }

  throw new Error('This message was not encrypted for this device or account');
}

export async function extractContentKey(payload,deviceId,privateJwks){
  let envelope=payload?.recipientEnvelopes?.find(e=>e.recipientDeviceId===deviceId);
  if(!envelope&&privateJwks?.deviceId)envelope=payload?.recipientEnvelopes?.find(e=>e.recipientDeviceId===privateJwks.deviceId);
  if(!envelope&&Array.isArray(payload?.recipientEnvelopes)&&payload.recipientEnvelopes.length)envelope=payload.recipientEnvelopes[0];
  if(!envelope)throw new Error('This message was not encrypted for this device');
  const one=envelope.oneTimePreKeyId&&privateJwks.oneTimePreKeys?.[envelope.oneTimePreKeyId];
  const jwk=one?privateJwks.oneTimePreKeys[envelope.oneTimePreKeyId]:privateJwks.signedPreKeyPrivateKey;
  if(!jwk)throw new Error('Required private key is unavailable');
  const priv=await crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const ep=await importEcdhPublic(envelope.ephemeralPublicKey);
  const wrappingKey=await deriveWrappingKey(priv,ep,fromB64(envelope.salt));
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(envelope.keyNonce)},wrappingKey,fromB64(envelope.encryptedKey));
  if(one)delete privateJwks.oneTimePreKeys[envelope.oneTimePreKeyId];
  return new Uint8Array(raw);
}

export async function createEnvelopeForDevice(rawContentKey,bundle){
  if(!bundle?.deviceId||!bundle?.signedPreKeyPublic)throw new Error('Target device encryption key is unavailable');
  const recipientPublic=await importEcdhPublic(bundle.signedPreKeyPublic);
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey=await deriveWrappingKey(ephemeral.privateKey,recipientPublic,salt);
  const keyNonce=crypto.getRandomValues(new Uint8Array(12));
  const encryptedKey=await crypto.subtle.encrypt({name:'AES-GCM',iv:keyNonce},wrappingKey,rawContentKey);
  return {recipientDeviceId:bundle.deviceId,oneTimePreKeyId:null,ephemeralPublicKey:await exportPublic(ephemeral.publicKey),salt:toB64(salt),keyNonce:toB64(keyNonce),encryptedKey:toB64(encryptedKey)};
}

export async function encryptFile(file){const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);const nonce=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,await file.arrayBuffer());return {blob:new Blob([encrypted],{type:'application/octet-stream'}),metadata:{name:file.name,mimeType:file.type||'application/octet-stream',size:file.size,key:toB64(await crypto.subtle.exportKey('raw',key)),nonce:toB64(nonce)}};}
export async function decryptFile(buf,meta){const key=await crypto.subtle.importKey('raw',fromB64(meta.key),{name:'AES-GCM'},false,['decrypt']);const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(meta.nonce)},key,buf);return new Blob([clear],{type:meta.mimeType||'application/octet-stream'});}
export function toBase64(bytes){return toB64(bytes)}

export async function createOneTimePreKeys(count=30){
  const oneTimePreKeys=[],privateOneTimePreKeys={};
  for(let i=0;i<count;i++){
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    const keyId=randomId();
    oneTimePreKeys.push({keyId,publicKey:await exportPublic(pair.publicKey)});
    privateOneTimePreKeys[keyId]=await crypto.subtle.exportKey('jwk',pair.privateKey);
  }
  return {oneTimePreKeys,privateOneTimePreKeys};
}

/* ─── Multi-Device Account Key Backup & Sync ────────────────────────── */
async function deriveBackupKey(password, salt) {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportAccountKeyBackup(material, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveBackupKey(password, salt);
  const plainBytes = enc.encode(JSON.stringify(material));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, plainBytes);
  return {
    encryptedData: toB64(encrypted),
    salt: toB64(salt),
    iv: toB64(iv)
  };
}

export async function importAccountKeyBackup(backup, password) {
  if (!backup?.encryptedData || !backup?.salt || !backup?.iv) throw new Error('Invalid key backup payload');
  const salt = fromB64(backup.salt);
  const iv = fromB64(backup.iv);
  const wrapKey = await deriveBackupKey(password, salt);
  const clearBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, fromB64(backup.encryptedData));
  return JSON.parse(dec.decode(clearBytes));
}
