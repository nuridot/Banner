const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/auth-client.js'), 'utf8');
const origin = 'https://nuridot.test';
const login = {accessToken:'access-1', refreshToken:'refresh-1', alias:'테스트'};
const ok = result => ({ok:true, json:async()=>({isSuccess:true,result})});
const fail = code => ({ok:false,json:async()=>({isSuccess:false,code})});
function storage() {
  const entries = new Map();
  return {setItem:(key,value)=>entries.set(key,value),getItem:key=>entries.get(key)??null,removeItem:key=>entries.delete(key)};
}
function client(fetch, localStorage=storage(), sessionStorage=storage(), clients={}) {
  const window = new EventTarget();
  window.__NURIDOT_WEB_CLIENTS__ = clients;
  const location={protocol:'https:',origin,assign:url=>{location.target=url;}};
  vm.runInNewContext(source,{window,location,sessionStorage,localStorage,fetch,URL,URLSearchParams,Event,
    crypto:require('node:crypto').webcrypto,btoa,TextEncoder,AbortController,setTimeout,clearTimeout});
  return {auth:window.NuridotAuth,sessionStorage,localStorage,location};
}

test('remember only the refresh token in the selected storage and revoke it on logout',async()=>{
  let sent;
  const c=client(async(url,opts)=>{sent=[url,JSON.parse(opts.body)];return ok(null);});
  c.auth.accept(login,true);
  assert.equal(JSON.parse(c.localStorage.getItem('nuridot.auth.v1')).refreshToken,'refresh-1');
  assert.ok(!c.localStorage.getItem('nuridot.auth.v1').includes('access-1'));
  c.auth.accept(login,false);
  assert.equal(c.localStorage.getItem('nuridot.auth.v1'),null);
  await c.auth.logout();
  assert.deepEqual(sent,['/api/auth/logout',{refreshToken:'refresh-1'}]);
  assert.equal(c.sessionStorage.getItem('nuridot.auth.v1'),null);
});

test('restore a session once for concurrent requests',async()=>{
  let refreshes=0;
  const c=client(()=>{});c.auth.accept(login,true);
  const next=client(async(url,opts)=>{
    if(url==='/api/auth/refresh'){refreshes++;return ok({accessToken:'fresh'});}
    assert.equal(opts.headers.Authorization,'Bearer fresh');
    return ok({available:123});
  },c.localStorage);
  await Promise.all([next.auth.wallet(),next.auth.wallet()]);
  assert.equal(refreshes,1);
});

test('retry an expired access token once and clear a rejected refresh token',async()=>{
  const calls=[];
  const c=client(async(url)=>{calls.push(url);return fail('AUTH4003');});
  c.auth.accept(login,false);
  await assert.rejects(c.auth.wallet());
  assert.deepEqual(calls,['/api/users/credit/wallet','/api/auth/refresh']);
  assert.equal(c.auth.session,null);
});

test('a late refresh cannot sign out or overwrite a newer login',async()=>{
  let finishRefresh;
  const c=client(async(url)=>url.includes('wallet')?fail('AUTH4003'):new Promise(r=>{finishRefresh=r;}));
  c.auth.accept(login,true);
  const waiting=c.auth.wallet();
  await new Promise(r=>setImmediate(r));
  c.auth.accept({...login,refreshToken:'other',alias:'새 계정'},true);
  finishRefresh(fail('AUTH4003'));
  await assert.rejects(waiting);
  assert.equal(c.auth.session.name,'새 계정');
});

test('PKCE sends the registered web callback and consumes a single bound state', async()=>{
  const provider={provider:'NAVER',clientId:'public-web-id'};
  let body;
  const c=client(async(url,opts)=>{assert.equal(url,'/api/auth/social/login/naver');body=JSON.parse(opts.body);return ok({status:'SIGNUP_REQUIRED',signupToken:'ticket'});},
    storage(),storage(),{[origin]:{NAVER:provider.clientId}});
  await c.auth.startOAuth(provider,true);
  const url=new URL(c.location.target);
  assert.equal(url.origin+url.pathname,'https://nid.naver.com/oauth2/authorize');
  assert.equal(url.searchParams.get('scope'),'openid');
  assert.equal(url.searchParams.get('redirect_uri'),origin+'/auth-callback.html');
  c.sessionStorage.setItem('nuridot.oauth.v1.response', JSON.stringify({state:url.searchParams.get('state'),code:'once'}));
  assert.equal((await c.auth.finishOAuth()).result.status,'SIGNUP_REQUIRED');
  const challenge=require('node:crypto').createHash('sha256').update(body.codeVerifier).digest('base64url');
  assert.equal(challenge,url.searchParams.get('code_challenge'));
  assert.equal(body.keepLoggedIn,true);
  assert.equal(await c.auth.finishOAuth(),null);
});

test('desktop-only clients and unmatched OAuth callbacks do not send a code',async()=>{
  let calls=0;
  const c=client(()=>{calls++;});
  await assert.rejects(c.auth.startOAuth({provider:'GOOGLE',clientId:'desktop-id'},false));
  c.sessionStorage.setItem('nuridot.oauth.v1',JSON.stringify({state:'expected',provider:'KAKAO',time:Date.now(),redirectUri:origin+'/auth-callback.html'}));
  c.sessionStorage.setItem('nuridot.oauth.v1.response',JSON.stringify({state:'wrong',code:'unused'}));
  await assert.rejects(c.auth.finishOAuth(),{code:'OAUTH_RESTART'});
  assert.equal(calls,0);
});
