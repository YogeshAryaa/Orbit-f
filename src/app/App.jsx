import {useEffect} from 'react';
import {Navigate,Route,Routes} from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import NotificationBanner from '../components/NotificationBanner.jsx';
import {useAuth} from '../context/AuthContext.jsx';
import {autoRegisterPush} from '../lib/pushNotifications.js';
import ChatPage from '../pages/ChatPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import {LoginPage,RegisterPage,ForgotPasswordPage,ResetPasswordPage,VerifyEmailPage} from '../pages/AuthPages.jsx';

export default function App(){
  const {user,token}=useAuth();
  useEffect(()=>{if(user&&token)autoRegisterPush(user);},[user,token]);
  return (
    <>
      <NotificationBanner/>
      <Routes>
        <Route path="/" element={<Navigate to={token?'/chat':'/login'} replace/>}/>
        <Route path="/login" element={token?<Navigate to="/chat" replace/>:<LoginPage/>}/>
        <Route path="/register" element={token?<Navigate to="/chat" replace/>:<RegisterPage/>}/>
        <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
        <Route path="/reset-password" element={<ResetPasswordPage/>}/>
        <Route element={<ProtectedRoute/>}>
          <Route path="/chat" element={<ChatPage/>}/>
          <Route path="/settings" element={<SettingsPage/>}/>
          <Route path="/verify-email" element={<VerifyEmailPage/>}/>
        </Route>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </>
  );
}