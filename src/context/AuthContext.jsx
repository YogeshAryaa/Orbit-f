import {createContext,useCallback,useContext,useEffect,useState} from 'react';
import {authApi,userApi,e2eeApi} from '../api/index.js';
import {tokenStore,errorMessage} from '../api/client.js';
import {getDeviceId,getPlatformInfo} from '../lib/deviceIdentity.js';
import {getPrivateMaterial,savePrivateMaterial} from '../lib/crypto/cryptoStorage.js';
import {createDeviceKeyMaterial,exportAccountKeyBackup,importAccountKeyBackup} from '../lib/crypto/messageEncryption.js';

const C=createContext(null);
export const AuthProvider=({children})=>{
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  const [token,setToken]=useState(tokenStore.get());
  const [authError,setAuthError]=useState('');

  const accept=useCallback(async(data,password)=>{
    const t=data?.token;
    if(t){
      tokenStore.set(t);
      try{
        const userId=data.user?.id||data.user?._id;
        let material=await getPrivateMaterial(userId).catch(()=>null);

        // Check if server already has a key backup for this account
        let backupData=null;
        try{
          const res=await e2eeApi.getKeyBackup();
          backupData=res?.keyBackup;
        }catch{}

        // If another device already created a key backup and we have password, restore it!
        // This allows this device of the same account to view and decrypt ALL previous messages!
        if(backupData?.encryptedData&&password){
          try{
            const restored=await importAccountKeyBackup(backupData,password);
            if(restored?.privateJwks&&restored?.publicRegistration){
              material=restored;
              await savePrivateMaterial(material,userId);
            }
          }catch(err){
            console.warn('Key backup restoration failed:',err);
          }
        }

        // If still no material, create new device keys
        if(!material?.privateJwks||!material?.publicRegistration){
          material=await createDeviceKeyMaterial(getDeviceId());
          await savePrivateMaterial(material,userId);
        }

        // If no backup exists on server yet and we have the password, back up now!
        if(!backupData?.encryptedData&&password){
          try{
            const backupPayload=await exportAccountKeyBackup(material,password);
            await e2eeApi.saveKeyBackup(backupPayload);
          }catch(err){
            console.warn('Initial key backup failed:',err);
          }
        }

        // Register device with backend
        await e2eeApi.registerDevice({
          ...material.publicRegistration,
          ...getPlatformInfo(),
          deviceId:getDeviceId(),
          oneTimePreKeys:material.publicRegistration.oneTimePreKeys||[]
        });
      }catch(e){
        tokenStore.set(null);
        throw e;
      }
      setToken(t);
    }
    if(data?.user)setUser(data.user);
    return data;
  },[]);

  const refresh=useCallback(async()=>{
    if(!tokenStore.get()){setLoading(false);return;}
    try{
      const u=await userApi.me();
      setUser(u?.user||u);
      setToken(tokenStore.get());
    }catch(e){
      const status=e?.response?.status;
      if(status===401||status===403){
        tokenStore.set(null);
        setToken(null);
        setUser(null);
      }else{
        setAuthError('Cannot reach the server right now. Please check your connection and reload.');
      }
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    refresh();
    const expire=()=>{
      setToken(null);
      setUser(null);
      setAuthError('Your session expired or was revoked. Please sign in again.');
    };
    window.addEventListener('chat:session-expired',expire);
    return()=>window.removeEventListener('chat:session-expired',expire);
  },[refresh]);

  const login=async(identifier,password)=>{
    setAuthError('');
    try{
      const res=await authApi.login({identifier,password});
      return await accept(res,password);
    }catch(e){
      setAuthError(errorMessage(e));
      throw e;
    }
  };

  const register=async body=>{
    setAuthError('');
    try{
      const res=await authApi.register(body);
      return await accept(res,body.password);
    }catch(e){
      setAuthError(errorMessage(e));
      throw e;
    }
  };

  const logout=async all=>{
    try{
      if(tokenStore.get())all?await authApi.logoutAll():await authApi.logout();
    }finally{
      tokenStore.set(null);
      setToken(null);
      setUser(null);
      setAuthError('');
    }
  };

  const reloadUser=async()=>{
    const u=await userApi.me();
    setUser(u?.user||u);
  };

  return <C.Provider value={{user,setUser,token,loading,authError,login,register,logout,reloadUser}}>{children}</C.Provider>;
};
export const useAuth=()=>useContext(C);
