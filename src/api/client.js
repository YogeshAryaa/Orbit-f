import axios from 'axios';
const TOKEN_KEY='orbit_chat_token';
export const tokenStore={get:()=>sessionStorage.getItem(TOKEN_KEY),set:(v)=>v?sessionStorage.setItem(TOKEN_KEY,v):sessionStorage.removeItem(TOKEN_KEY)};
export const api=axios.create({baseURL:import.meta.env.VITE_API_BASE_URL||'http://localhost:5000/api',timeout:20000,headers:{Accept:'application/json'}});
api.interceptors.request.use(config=>{const token=tokenStore.get();if(token)config.headers.Authorization=`Bearer ${token}`;return config;});
api.interceptors.response.use(r=>r,err=>{const status=err?.response?.status;const isAuthEndpoint=String(err?.config?.url||'').includes('/auth/login')||String(err?.config?.url||'').includes('/auth/register');if(status===401&&!isAuthEndpoint){tokenStore.set(null);window.dispatchEvent(new CustomEvent('chat:session-expired'));}return Promise.reject(err);});
export const unwrap=(r)=>r?.data?.data ?? r?.data;
export const errorMessage=(e)=>e?.response?.data?.message||e?.response?.data?.error||e?.message||'Something went wrong';