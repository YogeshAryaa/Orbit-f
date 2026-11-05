import {useState,useEffect,useRef,useMemo} from 'react';import {Link,useNavigate,useSearchParams} from 'react-router-dom';import {MessageCircle,ShieldCheck,Eye,EyeOff,ArrowRight,KeyRound} from 'lucide-react';import toast from 'react-hot-toast';import {useAuth} from '../context/AuthContext.jsx';import {authApi} from '../api/index.js';import {errorMessage} from '../api/client.js';

/* ─── Starfield Canvas ──────────────────────────────────────────── */
function Starfield(){
  const ref=useRef(null);
  useEffect(()=>{
    const c=ref.current;if(!c)return;
    const ctx=c.getContext('2d');
    let raf,w,h;
    const stars=Array.from({length:80},()=>({
      x:Math.random(),y:Math.random(),
      r:Math.random()*1.4+.3,
      a:Math.random()*.5+.1,
      sp:Math.random()*.0003+.0001,
      ph:Math.random()*Math.PI*2
    }));
    const shooters=[];
    const resize=()=>{w=c.width=c.offsetWidth*2;h=c.height=c.offsetHeight*2;ctx.scale(1,1);};
    resize();window.addEventListener('resize',resize);
    let t=0;
    const draw=()=>{
      ctx.clearRect(0,0,w,h);
      t++;
      /* stars */
      for(const s of stars){
        const twinkle=Math.sin(t*s.sp*60+s.ph)*.35+.65;
        ctx.beginPath();
        ctx.arc(s.x*w,s.y*h,s.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(160,255,220,${s.a*twinkle})`;
        ctx.fill();
      }
      /* shooting stars — spawn occasionally */
      if(Math.random()<.006) shooters.push({
        x:Math.random()*.6*w,y:Math.random()*.3*h,
        vx:3+Math.random()*3,vy:1.5+Math.random()*2,
        life:1,len:40+Math.random()*50
      });
      for(let i=shooters.length-1;i>=0;i--){
        const s=shooters[i];
        s.x+=s.vx;s.y+=s.vy;s.life-=.015;
        if(s.life<=0){shooters.splice(i,1);continue;}
        const grad=ctx.createLinearGradient(s.x,s.y,s.x-s.vx*s.len/4,s.y-s.vy*s.len/4);
        grad.addColorStop(0,`rgba(121,226,192,${s.life*.7})`);
        grad.addColorStop(1,'rgba(121,226,192,0)');
        ctx.strokeStyle=grad;ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(s.x,s.y);
        ctx.lineTo(s.x-s.vx*s.len/4,s.y-s.vy*s.len/4);
        ctx.stroke();
      }
      raf=requestAnimationFrame(draw);
    };
    draw();
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);};
  },[]);
  return <canvas ref={ref} className="starfield-canvas"/>;
}

/* ─── Orbit Rings + Core Animation ──────────────────────────────── */
function OrbitAnimation(){return(
<div className="orbit-scene" aria-hidden="true">
  {/* Glowing aurora blobs */}
  <div className="aurora-blob aurora-1"/>
  <div className="aurora-blob aurora-2"/>
  <div className="aurora-blob aurora-3"/>
  {/* Central core */}
  <div className="orbit-core">
    <MessageCircle size={22}/>
  </div>
  {/* Orbit rings with dots */}
  <div className="orbit-ring orbit-ring-1">
    <div className="orbit-dot dot-teal"/>
  </div>
  <div className="orbit-ring orbit-ring-2">
    <div className="orbit-dot dot-green"/>
    <div className="orbit-dot dot-green dot-green-2"/>
  </div>
  <div className="orbit-ring orbit-ring-3">
    <div className="orbit-dot dot-cyan"/>
    <div className="orbit-dot dot-cyan dot-cyan-2"/>
  </div>
  {/* Expanding pulse rings */}
  <div className="orbit-pulse"/>
  <div className="orbit-pulse orbit-pulse-2"/>
  <div className="orbit-pulse orbit-pulse-3"/>
  {/* Connection lines */}
  <svg className="orbit-connections" viewBox="0 0 340 340">
    <line x1="170" y1="170" x2="170" y2="50" className="conn-line conn-1"/>
    <line x1="170" y1="170" x2="290" y2="230" className="conn-line conn-2"/>
    <line x1="170" y1="170" x2="60" y2="210" className="conn-line conn-3"/>
  </svg>
</div>
)}

/* ─── Animated Grid Background for Form Side ───────────────────── */
function FormGrid(){return(
<div className="form-grid-bg" aria-hidden="true">
  <div className="grid-lines"/>
  <div className="grid-glow"/>
</div>
)}

function AuthShell({title,subtitle,children}){return <main className="auth-screen">
<div className="auth-art">
  <Starfield/>
  <div className="auth-orb orb-one"/>
  <div className="auth-orb orb-two"/>
  <div className="auth-orb orb-three"/>
  <OrbitAnimation/>
  <div className="auth-art-content">
    <div className="brand-mark large"><MessageCircle size={27}/></div>
    <div className="eyebrow">A quieter kind of connection</div>
    <h1>Conversations that stay <em>yours.</em></h1>
    <p>Private by design. Connected in real time. Made for the people who matter.</p>
    <div className="privacy-callout"><ShieldCheck size={19}/><span><b>Privacy-first messaging</b><small>Encryption keys stay on your device.</small></span></div>
  </div>
  <div className="auth-art-footer">ORBIT MESSENGER · PRIVATE BY DESIGN</div>
</div>
<div className="auth-form-side">
  <FormGrid/>
  <div className="auth-form-box">
    <div className="auth-mobile-brand"><div className="brand-mark"><MessageCircle/></div><b>orbit</b></div>
    <div className="auth-heading"><span className="eyebrow">WELCOME TO ORBIT</span><h2>{title}</h2><p>{subtitle}</p></div>
    {children}
  </div>
  <div className="auth-foot">By continuing, you agree to use Orbit responsibly.</div>
</div>
</main>}
export function LoginPage(){const {login}=useAuth();const nav=useNavigate();const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false);const submit=async e=>{e.preventDefault();setBusy(true);try{await login(identifier,password);toast.success('Welcome back');nav('/chat');}catch(e){toast.error(errorMessage(e));}finally{setBusy(false);}};return <AuthShell title="Welcome back" subtitle="Sign in to pick up where you left off."><form className="auth-form" onSubmit={submit}><label>Username, email or phone<input autoFocus required value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="e.g. yogesh.arya" autoComplete="username"/></label><label>Password<div className="password-field"><input required type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password"/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label><div className="form-between"><Link to="/forgot-password">Forgot password?</Link></div><button className="primary-btn auth-submit" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight size={17}/></button></form><div className="auth-switch">New to Orbit? <Link to="/register">Create an account</Link></div></AuthShell>}
export function RegisterPage(){const {register}=useAuth();const nav=useNavigate();const [form,setForm]=useState({username:'',displayName:'',email:'',phone:'',password:''}),[busy,setBusy]=useState(false),[show,setShow]=useState(false);const change=e=>setForm({...form,[e.target.name]:e.target.value});const submit=async e=>{e.preventDefault();setBusy(true);try{await register(Object.fromEntries(Object.entries(form).filter(([k,v])=>v||['username','displayName','password'].includes(k))));toast.success('Account created');nav('/chat');}catch(e){toast.error(errorMessage(e));}finally{setBusy(false);}};return <AuthShell title="Create your account" subtitle="A few details and you’re ready to connect."><form className="auth-form" onSubmit={submit}><label>Display name<input name="displayName" required maxLength={60} value={form.displayName} onChange={change} placeholder="How people see you"/></label><label>Username<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.]+" value={form.username} onChange={change} placeholder="Choose a unique username"/></label><div className="form-grid"><label>Email <span className="optional">optional</span><input name="email" type="email" value={form.email} onChange={change} placeholder="you@example.com"/></label><label>Mobile <span className="optional">optional</span><input name="phone" type="tel" value={form.phone} onChange={change} placeholder="Phone number"/></label></div><label>Password<div className="password-field"><input name="password" type={show?'text':'password'} minLength={8} required value={form.password} onChange={change} placeholder="At least 8 characters"/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label><button className="primary-btn auth-submit" disabled={busy}>{busy?'Creating account…':'Create account'} <ArrowRight size={17}/></button></form><div className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></div></AuthShell>}
export function ForgotPasswordPage(){const [email,setEmail]=useState(''),[busy,setBusy]=useState(false);const submit=async e=>{e.preventDefault();setBusy(true);try{await authApi.requestReset({email});toast.success('If your account can receive email, a reset code was requested.');sessionStorage.setItem('orbit_reset_email',email);}catch(e){toast.error(errorMessage(e));}finally{setBusy(false);}};return <AuthShell title="Reset your password" subtitle="We’ll request a one-time code for your email."><form className="auth-form" onSubmit={submit}><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button className="primary-btn auth-submit" disabled={busy}>{busy?'Requesting…':'Request reset code'} <ArrowRight size={17}/></button><Link to="/reset-password" className="secondary-link"><KeyRound size={16}/> I already have a reset code</Link></form><div className="auth-switch"><Link to="/login">Back to sign in</Link></div></AuthShell>}
export function ResetPasswordPage(){const [params]=useSearchParams();const [email,setEmail]=useState(params.get('email')||sessionStorage.getItem('orbit_reset_email')||''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);const nav=useNavigate();const submit=async e=>{e.preventDefault();setBusy(true);try{await authApi.resetPassword({email,code,newPassword:password});toast.success('Password reset. Please sign in.');nav('/login');}catch(e){toast.error(errorMessage(e));}finally{setBusy(false);}};return <AuthShell title="Choose a new password" subtitle="Enter the code sent to your email and create a new password."><form className="auth-form" onSubmit={submit}><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>6-digit code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000"/></label><label>New password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary-btn auth-submit" disabled={busy}>{busy?'Updating…':'Reset password'} <ArrowRight size={17}/></button></form><div className="auth-switch"><Link to="/login">Back to sign in</Link></div></AuthShell>}
export function VerifyEmailPage(){const {user,reloadUser}=useAuth();const [code,setCode]=useState(''),[busy,setBusy]=useState(false);const submit=async e=>{e.preventDefault();setBusy(true);try{await authApi.verifyEmail({email:user?.email,code});await reloadUser();toast.success('Email verified');}catch(e){toast.error(errorMessage(e));}finally{setBusy(false);}};const request=async()=>{try{await authApi.requestVerifyCode();toast.success('Verification code requested');}catch(e){toast.error(errorMessage(e));}};return <AuthShell title="Verify your email" subtitle="Secure your account by confirming your email address."><div className="auth-form"><button className="secondary-btn" onClick={request}>Send verification code</button><form onSubmit={submit}><label>6-digit code<input required maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000"/></label><button className="primary-btn auth-submit" disabled={busy}>{busy?'Verifying…':'Verify email'}</button></form></div></AuthShell>}