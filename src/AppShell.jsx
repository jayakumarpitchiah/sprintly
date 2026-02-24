import { useState, useEffect } from "react";
import { supabase, dbGet, dbPost } from "./supabase.js";
import App from "./App.jsx";

const T = {
  bg0:"#0f1117", bg1:"#1a1d27", bg2:"#22263a", bg3:"#2a2d3a",
  b1:"#2a2d3a", b2:"#3a3d4a",
  t0:"#f0f0f0", t1:"#c0c4cc", t2:"#888", t3:"#555",
  acc:"#6366f1", accD:"#4f52c8",
  p1:"#f87171", p3:"#34d399",
};

const inp = {
  width:"100%", padding:"10px 12px", borderRadius:7,
  background:"#0f1117", border:`1px solid ${T.b2}`,
  color:T.t0, fontSize:14, outline:"none", boxSizing:"border-box",
};

const btn = (primary=true) => ({
  width:"100%", padding:"11px 0", borderRadius:7, border:"none",
  background: primary ? `linear-gradient(135deg,#6366f1,#8b5cf6)` : T.bg3,
  color: primary ? "#fff" : T.t1,
  fontSize:14, fontWeight:600, cursor:"pointer",
});

function Card({ children, width=380 }) {
  return (
    <div style={{minHeight:"100vh", background:T.bg0, display:"flex",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Inter','SF Pro Text',system-ui,sans-serif"}}>
      <div style={{width, background:T.bg1, border:`1px solid ${T.b2}`,
        borderRadius:14, padding:"36px 32px", boxShadow:"0 24px 48px #00000060"}}>
        <div style={{textAlign:"center", marginBottom:28}}>
          <div style={{width:44, height:44,
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            borderRadius:12, display:"inline-flex", alignItems:"center",
            justifyContent:"center", fontSize:22, marginBottom:12}}>S</div>
          <div style={{fontSize:20, fontWeight:700, color:T.t0, letterSpacing:-0.5}}>Sprintly</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, type="text", value, onChange, placeholder, autoFocus }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{fontSize:11, color:T.t2, display:"block", marginBottom:5,
        textTransform:"uppercase", letterSpacing:0.5}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} style={inp}/>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode]       = useState("login"); // login | signup
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]       = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "signup") {
        if (!name||!email||!password||!orgName) { setError("All fields required"); setLoading(false); return; }
        const { data, error: e } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } }
        });
        if (e) throw e;
        // Create org + add as admin
        const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-");
        await dbPost("orgs", { name: orgName, slug: `${slug}-${Date.now().toString(36)}` });
        const orgs = await dbGet("orgs", `slug=like.${slug}*&order=created_at.desc&limit=1`);
        const org = orgs?.[0];
        if (!org) throw new Error("Failed to create org");
        await dbPost("org_members", { org_id: org.id, user_id: data.user.id, role: "admin" });
        onAuth(data.user, org);
      } else {
        const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onAuth(data.user, null);
      }
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const onKey = e => e.key==="Enter" && handle();

  return (
    <Card>
      <div style={{fontSize:12, color:T.t2, textAlign:"center", marginBottom:20}}>
        {mode==="login" ? "Sign in to your workspace" : "Create your organisation"}
      </div>

      {mode==="signup" && <>
        <Field label="Your Name" value={name} onChange={setName} placeholder="Jayakumar" autoFocus/>
        <Field label="Organisation Name" value={orgName} onChange={setOrgName} placeholder="KNOW"/>
      </>}

      <Field label="Email" type="email" value={email} onChange={setEmail}
        placeholder="you@company.com" autoFocus={mode==="login"}/>
      <Field label="Password" type="password" value={password} onChange={setPassword}
        placeholder="Min 6 characters" />

      {error && <div style={{fontSize:12, color:T.p1, marginBottom:12,
        padding:"8px 10px", background:"#f8717115", borderRadius:5,
        border:"1px solid #f8717130"}}>{error}</div>}

      <button onClick={handle} disabled={loading} style={{...btn(true), marginTop:4}}>
        {loading ? "..." : mode==="login" ? "Sign In" : "Create Workspace"}
      </button>

      <div style={{textAlign:"center", marginTop:16, fontSize:12, color:T.t3}}>
        {mode==="login"
          ? <span>No account? <button onClick={()=>{setMode("signup");setError("");}}
              style={{background:"none",border:"none",color:T.acc,cursor:"pointer",fontSize:12}}>
              Create one</button></span>
          : <span>Already have one? <button onClick={()=>{setMode("login");setError("");}}
              style={{background:"none",border:"none",color:T.acc,cursor:"pointer",fontSize:12}}>
              Sign in</button></span>
        }
      </div>
    </Card>
  );
}

// ─── PROJECT SELECTOR ─────────────────────────────────────────────────────────
function ProjectScreen({ user, org, onSelect, onSignOut }) {
  const [projects, setProjects]   = useState([]);
  const [creating, setCreating]   = useState(false);
  const [pName, setPName]         = useState("");
  const [pDesc, setPDesc]         = useState("");
  const [sprintStart, setSprintStart] = useState(new Date().toISOString().slice(0,10));
  const [sprintEnd, setSprintEnd] = useState("");
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  useEffect(()=>{ loadProjects(); },[org]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await dbGet("projects", `org_id=eq.${org.id}&order=created_at.desc`);
      setProjects(data||[]);
    } catch(e) { console.error("loadProjects", e); }
    setLoading(false);
  };

  const createProject = async () => {
    if (!pName.trim()) { setError("Project name required"); return; }
    setSaving(true); setError("");
    const config = {
      sprintStart, sprintEnd,
      holidays: [], calendarEvents: [],
      velocity: 1.0,
    };
    try {
      const rows = await dbPost("projects",
        { org_id: org.id, name: pName.trim(), description: pDesc.trim(), config, created_by: user.id });
      // fetch the created project
      const created = await dbGet("projects", `org_id=eq.${org.id}&order=created_at.desc&limit=1`);
      onSelect(created?.[0]);
    } catch(e) { setError(e.message); setSaving(false); return; }
  };

  const cardStyle = {
    background:T.bg2, border:`1px solid ${T.b2}`, borderRadius:10,
    padding:"16px 18px", cursor:"pointer", transition:"border-color 0.15s",
  };

  if (loading) return (
    <Card><div style={{textAlign:"center",color:T.t2,padding:"20px 0"}}>Loading projects...</div></Card>
  );

  return (
    <div style={{minHeight:"100vh", background:T.bg0,
      fontFamily:"'Inter','SF Pro Text',system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{borderBottom:`1px solid ${T.b1}`, padding:"14px 32px",
        display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{width:32, height:32,
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            borderRadius:8, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:16, color:"#fff", fontWeight:700}}>S</div>
          <div>
            <div style={{fontSize:14, fontWeight:600, color:T.t0}}>{org.name}</div>
            <div style={{fontSize:11, color:T.t2}}>{user.email}</div>
          </div>
        </div>
        <button onClick={onSignOut} style={{background:"transparent", border:`1px solid ${T.b2}`,
          borderRadius:6, padding:"5px 12px", color:T.t2, fontSize:12, cursor:"pointer"}}>
          Sign out
        </button>
      </div>

      <div style={{maxWidth:680, margin:"40px auto", padding:"0 24px"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
          <div>
            <div style={{fontSize:20, fontWeight:700, color:T.t0}}>Projects</div>
            <div style={{fontSize:12, color:T.t2, marginTop:2}}>
              Each project is a sprint or release plan
            </div>
          </div>
          {!creating && (
            <button onClick={()=>setCreating(true)} style={{
              padding:"8px 16px", borderRadius:7,
              background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
              color:"#fff", border:"none", fontSize:13, fontWeight:600, cursor:"pointer"}}>
              + New Project
            </button>
          )}
        </div>

        {/* Create form */}
        {creating && (
          <div style={{background:T.bg1, border:`1px solid ${T.b2}`,
            borderRadius:12, padding:"20px 22px", marginBottom:20}}>
            <div style={{fontSize:13, fontWeight:600, color:T.t0, marginBottom:16}}>New Project</div>
            <Field label="Project Name" value={pName} onChange={setPName}
              placeholder="e.g. Sprint Mar 2026 / Rappi Launch" autoFocus/>
            <Field label="Description (optional)" value={pDesc} onChange={setPDesc}
              placeholder="What this sprint covers"/>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
              <div>
                <label style={{fontSize:11,color:T.t2,display:"block",marginBottom:5,
                  textTransform:"uppercase",letterSpacing:0.5}}>Sprint Start</label>
                <input type="date" value={sprintStart} onChange={e=>setSprintStart(e.target.value)} style={inp}/>
              </div>
              <div>
                <label style={{fontSize:11,color:T.t2,display:"block",marginBottom:5,
                  textTransform:"uppercase",letterSpacing:0.5}}>Sprint End</label>
                <input type="date" value={sprintEnd} onChange={e=>setSprintEnd(e.target.value)} style={inp}/>
              </div>
            </div>
            {error && <div style={{fontSize:12,color:T.p1,marginBottom:10}}>{error}</div>}
            <div style={{display:"flex", gap:8}}>
              <button onClick={createProject} disabled={saving} style={{
                flex:1, padding:"9px 0", borderRadius:7,
                background:saving?T.bg3:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                color:"#fff", border:"none", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                {saving ? "Creating..." : "Create Project"}
              </button>
              <button onClick={()=>{setCreating(false);setError("");}} style={{
                padding:"9px 16px", borderRadius:7, background:T.bg3,
                color:T.t1, border:"none", fontSize:13, cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Project list */}
        {projects.length===0 && !creating ? (
          <div style={{textAlign:"center", padding:"60px 0", color:T.t2}}>
            <div style={{fontSize:40, marginBottom:12}}>📋</div>
            <div style={{fontSize:15, fontWeight:500, color:T.t1, marginBottom:6}}>No projects yet</div>
            <div style={{fontSize:13}}>Create your first sprint project to get started</div>
          </div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {projects.map(p => {
              const cfg = p.config||{};
              const fmt = d => d ? new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "–";
              return (
                <div key={p.id} onClick={()=>onSelect(p)} style={cardStyle}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=T.acc}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=T.b2}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:15, fontWeight:600, color:T.t0, marginBottom:3}}>{p.name}</div>
                      {p.description && <div style={{fontSize:12, color:T.t2, marginBottom:6}}>{p.description}</div>}
                      {cfg.sprintStart && (
                        <div style={{fontSize:11, color:T.t3, fontFamily:"monospace"}}>
                          {fmt(cfg.sprintStart)} → {fmt(cfg.sprintEnd)}
                        </div>
                      )}
                    </div>
                    <div style={{fontSize:11, color:T.acc, fontWeight:500, whiteSpace:"nowrap", marginLeft:16}}>
                      Open →
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INVITE MEMBER PANEL ──────────────────────────────────────────────────────
// Shown inside project — admin can copy invite link or add by email
function InviteModal({ org, onClose }) {
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState("member");
  const [msg, setMsg]       = useState("");
  const [loading, setLoading] = useState(false);

  const invite = async () => {
    if (!email) return;
    setLoading(true); setMsg("");
    // Supabase doesn't have direct invite-by-email in anon mode
    // Best approach: show instructions + org ID for self-signup
    setMsg(`Share this with ${email}: Sign up at sprintly-ycig.vercel.app with this org code: ${org.id.slice(0,8)}`);
    setLoading(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#00000080",zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={onClose}>
      <div style={{background:"#1a1d27",borderRadius:12,padding:"24px 28px",
        width:420,border:"1px solid #3a3d4a"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:15,fontWeight:600,color:"#f0f0f0",marginBottom:16}}>Invite Team Member</div>
        <div style={{fontSize:12,color:"#888",marginBottom:16,lineHeight:1.6}}>
          Share the signup link below. When they sign up, give them the <strong style={{color:"#f0f0f0"}}>Org Code</strong> to join your workspace.
        </div>
        <div style={{background:"#0f1117",borderRadius:6,padding:"10px 12px",marginBottom:12,fontFamily:"monospace",fontSize:12,color:"#6366f1",border:"1px solid #2a2d3a"}}>
          Org Code: <strong>{org.id.slice(0,8).toUpperCase()}</strong>
        </div>
        <div style={{fontSize:12,color:"#555",marginBottom:16}}>
          (Join org flow coming soon — for now, share this code and they enter it after signup)
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"9px 0",borderRadius:7,
          background:"#2a2d3a",color:"#c0c4cc",border:"none",fontSize:13,cursor:"pointer"}}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── ROOT SHELL ───────────────────────────────────────────────────────────────
export default function AppShell() {
  const [user, setUser]       = useState(null);
  const [org, setOrg]         = useState(null);
  const [project, setProject] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showInvite, setShowInvite]   = useState(false);

  useEffect(()=>{
    // Check existing session
    supabase.auth.getSession().then(async ({data:{session}})=>{
      if (session) {
        setUser(session.user);
        await loadOrg(session.user);
      }
      setAuthLoading(false);
    });

    // Listen for auth changes
    const {data:{subscription}} = supabase.auth.onAuthStateChange(async (_event, session)=>{
      if (session) {
        setUser(session.user);
        await loadOrg(session.user);
      } else {
        setUser(null); setOrg(null); setProject(null);
      }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  const loadOrg = async (u) => {
    try {
      const data = await dbGet("org_members", `user_id=eq.${u.id}&select=orgs(*)&limit=1`);
      if (data?.[0]?.orgs) setOrg(data[0].orgs);
    } catch(e) { console.error("loadOrg", e); }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setOrg(null); setProject(null);
  };

  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#0f1117",display:"flex",
      alignItems:"center",justifyContent:"center",color:"#555",
      fontFamily:"system-ui",fontSize:14}}>Loading...</div>
  );

  if (!user) return <AuthScreen onAuth={(u,o)=>{ setUser(u); if(o) setOrg(o); }}/>;

  if (!org) return (
    <Card>
      <div style={{textAlign:"center",color:T.t2,fontSize:13,lineHeight:1.8}}>
        <div style={{fontSize:32,marginBottom:12}}>🏢</div>
        Setting up your workspace...<br/>
        <button onClick={signOut} style={{marginTop:16,background:"none",
          border:"none",color:T.t3,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>
          Sign out
        </button>
      </div>
    </Card>
  );

  if (!project) return (
    <>
      <ProjectScreen user={user} org={org} onSelect={setProject} onSignOut={signOut}/>
    </>
  );

  // ── Main app with project context ──
  return (
    <>
      {showInvite && <InviteModal org={org} onClose={()=>setShowInvite(false)}/>}
      <App
        projectId={project.id}
        projectName={project.name}
        orgName={org.name}
        user={user}
        onBackToProjects={()=>setProject(null)}
        onInvite={()=>setShowInvite(true)}
        onSignOut={signOut}
      />
    </>
  );
}
