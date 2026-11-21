/* The homepage is a public client. Provider client secrets stay on the API server. */
(() => {
  'use strict';
  const base = (window.__API_BASE__ || (location.protocol === 'https:' ? '' : 'https://api.semojum.app')).replace(/\/+$/, '');
  const key = 'nuridot.auth.v1';
  const flowKey = 'nuridot.oauth.v1';
  const endpoints = {
    GOOGLE: ['https://accounts.google.com/o/oauth2/v2/auth', 'openid email profile'],
    KAKAO: ['https://kauth.kakao.com/oauth/authorize', ''],
    NAVER: ['https://nid.naver.com/oauth2/authorize', 'openid']
  };
  // Public client IDs with a registered callback on the corresponding website.
  const webClients = window.__NURIDOT_WEB_CLIENTS__ || {
    'https://nuridot.com': {
      GOOGLE: '105223910730-7fhrj357igimt4u30p50jehq031i6a6e.apps.googleusercontent.com',
      KAKAO: '896628722e04852fc007e04acfb7bc32',
      NAVER: 'WNJ5FIotv_hI2wQpsbsP'
    }
  };
  const agreements = { termsVersion: '2026-11-09', privacyVersion: '2026-11-09' };

  async function request(path, body, bearer) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST', headers, credentials:'omit',
        cache:'no-store', referrerPolicy:'no-referrer', redirect:'error', signal:controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok || data.isSuccess !== true) {
        throw Object.assign(new Error(data.message || 'Request failed'), {code:data.code, detail:data.result || {}});
      }
      return data.result;
    } finally { clearTimeout(timeout); }
  }
  function readStored(storage) {
    try {
      const data = JSON.parse(storage.getItem(key));
      return data && typeof data.refreshToken === 'string' && data.refreshToken ? data : null;
    } catch { return null; }
  }
  function restore() { return readStored(sessionStorage) || readStored(localStorage); }
  let session = restore();
  let access = null;
  let refreshWork = null;
  function change() { window.dispatchEvent(new Event('nuridot-session')); }
  function forget(previous) {
    if (!previous || session?.refreshToken !== previous.refreshToken) return;
    for (const store of [localStorage, sessionStorage]) {
      if (readStored(store)?.refreshToken === previous.refreshToken) store.removeItem(key);
    }
    session = null;
    access = null;
    change();
  }
  function accept(result, keep, fallback) {
    if (!result?.accessToken || !result.refreshToken || result.mfaRequired) throw new Error('Invalid session');
    const next = {refreshToken:result.refreshToken, name:result.alias || fallback || '', role:result.role, memberType:result.memberType};
    const target = keep ? localStorage : sessionStorage;
    target.setItem(key, JSON.stringify(next));
    (keep ? sessionStorage : localStorage).removeItem(key);
    session = next;
    access = result.accessToken;
    change();
  }
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    const next = restore();
    if (next?.refreshToken === session?.refreshToken) return;
    session = next;
    access = null;
    change();
  });
  function refresh(current) {
    if (refreshWork?.forToken === current.refreshToken) return refreshWork.promise;
    const promise = request('/api/auth/refresh', {refreshToken:current.refreshToken})
      .then(result => {
        if (session !== current || !result?.accessToken) throw new Error('Session changed');
        return (access = result.accessToken);
      }).catch(error => {
        if (['AUTH4003','AUTH4004','USER4001'].includes(error.code)) forget(current);
        throw error;
      }).finally(() => { if (refreshWork?.promise === promise) refreshWork = null; });
    refreshWork = {forToken:current.refreshToken, promise};
    return promise;
  }
  async function wallet() {
    const current = session;
    if (!current) return null;
    const token = access || await refresh(current);
    try { return await request('/api/users/credit/wallet', undefined, token); }
    catch (error) {
      if (error.code === 'USER4001' || error.code === 'AUTH4004') forget(current);
      if (session !== current || !['COMMON4001','AUTH4003'].includes(error.code)) throw error;
      const fresh = access !== token && access ? access : await refresh(current);
      return await request('/api/users/credit/wallet', undefined, fresh);
    }
  }
  async function logout() {
    const current = session;
    if (!current) return;
    try { await request('/api/auth/logout', {refreshToken:current.refreshToken}); }
    catch (error) { if (!['AUTH4003','USER4001'].includes(error.code)) throw error; }
    forget(current);
  }
  function b64url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  }
  function enabled(provider) {
    return Boolean(provider && provider.clientId && webClients[location.origin]?.[provider.provider] === provider.clientId);
  }
  async function startOAuth(provider, keep) {
    if (!enabled(provider) || !Object.hasOwn(endpoints,provider.provider)) throw new Error('Web client unavailable');
    const [host,scope] = endpoints[provider.provider];
    const redirectUri = location.origin + '/auth-callback.html';
    const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const url = new URL(host);
    url.search = new URLSearchParams({client_id:provider.clientId, redirect_uri:redirectUri,
      response_type:'code', state, code_challenge:challenge, code_challenge_method:'S256'});
    if (scope) url.searchParams.set('scope',scope);
    sessionStorage.setItem(flowKey, JSON.stringify({provider:provider.provider, state, verifier, redirectUri, keep, time:Date.now()}));
    location.assign(url.href);
  }
  async function finishOAuth() {
    const callback = sessionStorage.getItem(flowKey + '.response');
    if (!callback) return null;
    sessionStorage.removeItem(flowKey + '.response');
    const raw = sessionStorage.getItem(flowKey);
    sessionStorage.removeItem(flowKey);
    const flow = raw && JSON.parse(raw);
    const response = JSON.parse(callback);
    if (!flow || !Object.hasOwn(endpoints,flow.provider) || flow.state !== response.state ||
        flow.redirectUri !== location.origin + '/auth-callback.html' || Date.now()-flow.time > 600000 ||
        response.error || !response.code) throw Object.assign(new Error('Authorization ended'), {code:'OAUTH_RESTART'});
    const result = await request('/api/auth/social/login/' + flow.provider.toLowerCase(), {
      code:response.code, codeVerifier:flow.verifier, redirectUri:flow.redirectUri, keepLoggedIn:flow.keep
    });
    return {result, keep:flow.keep};
  }
  window.NuridotAuth = {request, accept, wallet, logout, enabled, startOAuth, finishOAuth, agreements,
    get session() { return session; }};
})();
