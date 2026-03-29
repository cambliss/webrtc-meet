(async()=>{
  const base='http://localhost:3001';
  const out=[];
  const fmt=(n,ok,d)=>out.push({name:n,ok,detail:d});
  
  const getCookie=(res)=>{
    const h=res.headers;
    if(typeof h.getSetCookie==='function'){
      const arr=h.getSetCookie();
      if(arr&&arr.length)return arr;
    }
    const s=h.get('set-cookie');
    return s?[s]:[];
  };
  
  const jar=[];
  const add=(res)=>{ 
    for(const sc of getCookie(res)){ 
      const p=sc.split(';')[0];
      const k=p.split('=')[0];
      const i=jar.findIndex(c=>c.startsWith(k+'='));
      if(i>=0) jar[i]=p;
      else jar.push(p);
    }
  };
  
  const cookie=()=>jar.join('; ');
  const authed=(path,opts={})=>fetch(base+path,{...opts,headers:{...(opts.headers||{}),Cookie:cookie()}});
  const check=async(name,path,opts={})=>{
    try{
      const r=await authed(path,opts);
      let j=null;
      try{j=await r.json();}catch{}
      fmt(name,r.ok,'status='+r.status);
      return {r,j};
    }catch(e){
      fmt(name,false,'error: '+e.message);
      return {r:null,j:null};
    }
  };
  
  // Login
  const login=await authed('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'host',password:'host123'})});
  add(login);
  let loginJ={};
  try{loginJ=await login.json();}catch{}
  fmt('auth.login',login.ok,'status='+login.status);
  if(!login.ok){
    console.log(JSON.stringify({summary:{passed:out.filter(x=>x.ok).length,failed:out.filter(x=>!x.ok).length},results:out},null,2));
    process.exit(1);
  }
  
  // Get auth context
  const me=await authed('/api/auth/me');
  let meJ={};
  try{meJ=await me.json();}catch{}
  fmt('auth.me',me.ok,'status='+me.status);
  const wsId=meJ?.user?.workspaceId||null;
  if(!wsId){
    fmt('workspace.scope',false,'no workspaceId');
    console.log(JSON.stringify({summary:{passed:out.filter(x=>x.ok).length,failed:out.filter(x=>!x.ok).length},results:out},null,2));
    process.exit(1);
  }
  
  // Test workspace invite
  await check('workspace.invite','/api/workspaces/'+wsId+'/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test.invite@example.com',role:'member'})});
  
  // Test members patch and delete
  const members=await authed('/api/workspaces/'+wsId+'/members');
  let membersJ={};
  try{membersJ=await members.json();}catch{}
  const targetUserId=membersJ?.members?.[1]?.userId||null;
  if(targetUserId){
    await check('workspace.members.patch','/api/workspaces/'+wsId+'/members/'+targetUserId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin'})});
    await check('workspace.members.delete','/api/workspaces/'+wsId+'/members/'+targetUserId,{method:'DELETE'});
  }else{
    fmt('workspace.members.patch',false,'no target user');
    fmt('workspace.members.delete',false,'no target user');
  }
  
  // Test file upload and delete
  const fileBlob=new Blob(['test content'],{type:'text/plain'});
  const formData=new FormData();
  formData.append('file',new File([fileBlob],'test.txt',{type:'text/plain'}));
  const uploadRes=await authed('/api/workspaces/'+wsId+'/secure-files',{method:'POST',body:formData});
  let uploadJ={};
  try{uploadJ=await uploadRes.json();}catch{}
  fmt('workspace.secureFile.upload',uploadRes.ok,'status='+uploadRes.status);
  const fileId=uploadJ?.file?.id||null;
  if(fileId){
    await check('workspace.secureFile.delete','/api/workspaces/'+wsId+'/secure-files/'+fileId,{method:'DELETE'});
  }else{
    fmt('workspace.secureFile.delete',false,'no fileId');
  }
  
  // Test DM send
  const users=await authed('/api/workspaces/'+wsId+'/users');
  let usersJ={};
  try{usersJ=await users.json();}catch{}
  const targetDmUser=usersJ?.users?.[0]?.id||null;
  if(targetDmUser){
    await check('workspace.dm.send','/api/workspaces/'+wsId+'/direct-messages/'+targetDmUser,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Hello from verification'})});
    
    const dmFileBlob=new Blob(['dm test'],{type:'text/plain'});
    const dmFormData=new FormData();
    dmFormData.append('file',new File([dmFileBlob],'dm-test.txt',{type:'text/plain'}));
    const dmFileRes=await authed('/api/workspaces/'+wsId+'/direct-message-files/'+targetDmUser,{method:'POST',body:dmFormData});
    fmt('workspace.dm.sendFile',dmFileRes.ok,'status='+dmFileRes.status);
  }else{
    fmt('workspace.dm.send',false,'no target user');
    fmt('workspace.dm.sendFile',false,'no target user');
  }
  
  // Test API key create and revoke
  const apiKeysRes=await authed('/api/workspaces/'+wsId+'/api-keys');
  let apiKeysJ={};
  try{apiKeysJ=await apiKeysRes.json();}catch{}
  await check('workspace.apiKey.create','/api/workspaces/'+wsId+'/api-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'test-key'})});
  const targetKeyId=apiKeysJ?.apiKeys?.[0]?.id||null;
  if(targetKeyId){
    await check('workspace.apiKey.revoke','/api/workspaces/'+wsId+'/api-keys/'+targetKeyId,{method:'DELETE'});
  }else{
    fmt('workspace.apiKey.revoke',false,'no key to revoke');
  }
  
  const p=out.filter(x=>x.ok).length, f=out.filter(x=>!x.ok).length;
  console.log(JSON.stringify({summary:{passed:p,failed:f},results:out},null,2));
  process.exitCode=f>0?2:0;
})().catch(err=>{ console.error(err); process.exit(1); });
