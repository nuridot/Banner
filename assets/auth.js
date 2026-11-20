(() => {
  'use strict';
  const auth = window.NuridotAuth;
  const dialog = document.querySelector('#auth-dialog');
  const content = document.querySelector('#auth-content');
  const status = document.querySelector('#auth-status');
  const openButton = document.querySelector('#auth-open');
  const credit = document.querySelector('#auth-credit');
  const closeButton = document.querySelector('#auth-close');
  const text = (ko,en) => document.documentElement.lang === 'en' ? en : ko;
  const titles = {
    login:['로그인','Log in'], signup:['회원가입','Sign up'], reset:['비밀번호 재설정','Reset password'],
    verify:['이메일 인증','Verify your email'], newPassword:['새 비밀번호 설정','Set a new password'],
    consent:['약관 동의','Review agreements'], account:['내 계정','My account']
  };
  let page = 'login', providers = [], ticket = null, social = null, pending = false;
  let keep = true, balance = null, clock = null, nextSend = 0, verifyEnds = 0;
  let providerLoad = 0, headerRevision = 0, walletCheckedAt = 0;
  const title = key => text(...titles[key]);
  const form = () => content.querySelector('form');
  const field = (name,label,type,auto,attrs='') =>
    '<label class="auth-field"><span>'+label+'</span><input name="'+name+'" type="'+type+'" autocomplete="'+auto+'" required '+attrs+'></label>';
  const email = () => field('email',text('이메일','Email'),'email','email','maxlength="254"');
  const password = (name,label,auto) => field(name,label,'password',auto,auto==='new-password'?'minlength="8" maxlength="64"':'');
  const submit = label => '<button type="submit" class="auth-submit">'+label+'</button>';
  const action = (id,label) => '<button type="button" class="auth-link" data-action="'+id+'">'+label+'</button>';
  function agreements() {
    return '<div class="auth-consents"><label class="auth-check auth-all"><input name="all" type="checkbox">'+
      text('약관에 모두 동의합니다','Agree to all terms')+'</label>'+
      [['terms','terms.html',text('[필수] 이용약관 동의','[Required] Terms of Service')],
       ['privacy','privacy.html',text('[필수] 개인정보 처리방침 동의','[Required] Privacy Policy')]].map(([name,url,label]) =>
        '<div class="auth-consent-line"><label class="auth-check"><input name="'+name+'" type="checkbox" required>'+label+
        '</label><a href="'+url+'" target="_blank" rel="noopener">'+text('보기','View')+'</a></div>').join('')+'</div>';
  }
  function say(message='',bad=false) {
    status.textContent=message;
    status.toggleAttribute('data-error',bad);
  }
  function renderSocial() {
    const slot = content.querySelector('.auth-social');
    if (!slot) return;
    slot.replaceChildren();
    const lang = text('ko','en');
    for (const name of ['GOOGLE','KAKAO','NAVER']) {
      const provider = providers.find(item=>item.provider === name);
      if (!provider) continue;
      const button = document.createElement('button');
      const label = {GOOGLE:text('Google로 계속하기','Continue with Google'),KAKAO:text('카카오 로그인','Log in with Kakao'),NAVER:text('네이버 로그인','Log in with NAVER')}[name];
      button.type='button'; button.className=name.toLowerCase(); button.dataset.provider=name;
      button.setAttribute('aria-label',label);
      if (!auth.enabled(provider)) {
        button.setAttribute('aria-disabled','true');
        button.title = text('홈페이지 연결 준비 중 · 이메일로 로그인할 수 있습니다.','Web sign-in is being set up. You can use email.');
      }
      const img = document.createElement('img');
      img.alt='';
      if (name==='GOOGLE') {
        img.src='assets/auth/google.png'; img.width=20; img.height=20;
        button.append(img,document.createTextNode(label));
      } else {
        img.src='assets/auth/'+name.toLowerCase()+'-'+lang+'.png'; img.className='auth-brand-art'; button.append(img);
      }
      slot.append(button);
    }
    content.querySelector('.auth-divider').hidden=!slot.childElementCount;
  }
  async function getProviders() {
    const revision=++providerLoad;
    try {
      const list=await auth.request('/api/auth/social/providers');
      if (revision!==providerLoad) return;
      providers=Array.isArray(list)?list.filter(p=>p && typeof p.clientId==='string' && p.clientId):[];
    } catch { if (revision!==providerLoad) return; providers=[]; }
    renderSocial();
  }
  function render(next,notice='') {
    page=next; clearInterval(clock); clock=null;
    closeButton.setAttribute('aria-label',text('닫기','Close'));
    dialog.setAttribute('aria-label',title(page));
    let top='',body='';
    if (page==='login'||page==='signup') {
      top='<div class="auth-tabs" role="group" aria-label="'+text('계정','Account')+'">'+['login','signup'].map(key=>
        '<button type="button" data-page="'+key+'" aria-pressed="'+(page===key)+'">'+title(key)+'</button>').join('')+
        '</div><div class="auth-social"></div><div class="auth-divider" hidden>'+text('또는 이메일로','or continue with email')+'</div>';
    } else top='<h2 class="auth-subtitle">'+title(page)+'</h2>';
    if (page==='login') {
      body=field('loginId',text('아이디 또는 이메일','ID or email'),'text','username','autocapitalize="none" spellcheck="false"')+
        password('password',text('비밀번호','Password'),'current-password')+
        '<div class="auth-opts"><label class="auth-check"><input name="keep" type="checkbox" '+(keep?'checked':'')+'>'+
        text('로그인 상태 유지','Keep me signed in')+'</label>'+action('reset',title('reset'))+'</div>'+submit(title('login'));
    } else if (page==='signup') {
      body=email()+field('nickname',text('닉네임','Nickname'),'text','nickname','minlength="2" maxlength="20"')+
        newPasswords()+agreements()+submit(title('signup'));
    } else if (page==='consent') {
      body='<p class="auth-note" id="social-identity"></p>'+agreements()+submit(title('signup'));
    } else if (page==='reset') {
      body=email()+submit(text('인증 코드 받기','Send verification code'))+action('login',title('login'));
    } else if (page==='verify'||page==='newPassword') {
      body=field('code',text('이메일 인증 코드','Email verification code'),'text','one-time-code',
        'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')+(page==='newPassword'?newPasswords():'')+
        submit(page==='verify'?text('인증하고 로그인','Verify and log in'):title('reset'))+
        action('resend',text('코드 재발송','Resend code'))+action(page==='verify'?'signup':'reset',text('처음부터 다시','Start over'));
    } else if (page==='account') {
      body='<p class="auth-note" id="account-name"></p>'+submit(text('로그아웃','Log out'));
    }
    content.innerHTML=top+'<form class="auth-form">'+body+'</form>';
    if (page==='account') content.querySelector('#account-name').textContent=auth.session?.name || title('account');
    if (page==='consent') content.querySelector('#social-identity').textContent=[social?.nickname,social?.email].filter(Boolean).join(' · ');
    renderSocial();
    say(notice);
    if (page==='verify'||page==='newPassword') { tick(); clock=setInterval(tick,1000); }
    if (dialog.open) (form()?.querySelector('input:not([type="checkbox"])')||content.querySelector('h2')||closeButton)?.focus();
  }
  function newPasswords() {
    return password('password',text('비밀번호 (영문·숫자 포함 8~64자)','Password (8–64 characters, letters and digits)'),'new-password')+
      password('confirm',text('비밀번호 확인','Confirm password'),'new-password');
  }
  function tick() {
    const resend = content.querySelector('[data-action="resend"]');
    if (!resend) return;
    const left = Math.max(0, Math.ceil((nextSend-Date.now())/1000));
    resend.disabled = pending || left>0;
    resend.textContent = text('코드 재발송','Resend code')+(left?' ('+left+text('초)','s)'):'');
    if (Date.now()>=verifyEnds && ticket) {
      ticket=null; render(page==='verify'?'signup':'reset',text('인증 시간이 지났습니다. 다시 요청해 주세요.','Verification expired. Please start again.'));
    }
  }
  function setTicket(result) {
    if (!result?.verificationToken) throw new Error('Missing verification ticket');
    ticket=result.verificationToken;
    nextSend=Date.now()+Number(result.resendAfterSeconds ?? 60)*1000;
    verifyEnds=Date.now()+Number(result.expiresInSeconds ?? 600)*1000;
  }
  function describe(error) {
    const d=error.detail || {};
    switch(error.code) {
      case 'AUTH4001': case 'SIGNUP4006':
        return (error.code==='AUTH4001'?text('아이디 또는 비밀번호를 확인해 주세요.','Check your ID and password.'):text('인증 코드를 확인해 주세요.','Check your verification code.'))+
          (Number.isInteger(d.remainingAttempts)?text(' 남은 시도 '+d.remainingAttempts+'회.',' Attempts left: '+d.remainingAttempts+'.'):'');
      case 'AUTH4006':return text('로그인이 일시 잠겼습니다. '+(d.lockMinutes??10)+'분 후 다시 시도해 주세요.','Sign-in is locked. Try again in '+(d.lockMinutes??10)+' minutes.');
      case 'AUTH4004':return text('비활성 계정입니다. 기관 관리자에게 문의해 주세요.','This account is inactive. Contact your administrator.');
      case 'AUTH4005':return text('이 계정은 해당 서비스의 로그인 화면을 이용해 주세요.','Please use the sign-in page for this account’s service.');
      case 'SIGNUP4291':case 'SIGNUP4292':return text('요청이 많습니다. 잠시 후 다시 시도해 주세요.','Too many requests. Please try again later.');
      case 'SOCIAL4091':case 'SIGNUP4091':{
        const methods=(d.existingLoginMethods||[]).map(m=>m==='PASSWORD'?text('이메일·비밀번호','email and password'):m).join(', ');
        return text('이미 가입된 계정입니다. '+methods+' 방식으로 로그인해 주세요.','This account already exists. Sign in using '+(methods||'your existing method')+'.');
      }
      case 'SOCIAL4005':return text('약관이 변경되었습니다. 새 약관이 반영된 뒤 다시 동의해 주세요.','The agreements were updated. Please review the current versions before retrying.');
      case 'SIGNUP4003':return text('8~64자의 영문과 숫자를 조합하고, 이메일·닉네임·흔한 비밀번호는 피해 주세요.','Use 8–64 characters with letters and digits. Avoid your email, nickname and common passwords.');
      case 'SIGNUP4007':return text('시도 횟수를 초과했습니다. 코드를 다시 받아 주세요.','Too many attempts. Request a new code.');
      case 'SIGNUP4002':return text('일회용 이메일 주소는 사용할 수 없습니다.','Please use a non-disposable email address.');
      case 'OAUTH_RESTART':case 'SOCIAL4002':case 'SOCIAL4004':return text('소셜 로그인을 처음부터 다시 시도해 주세요.','Please restart social sign-in.');
      default:return error.code && document.documentElement.lang!=='en' ? error.message : text('요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.','Could not complete the request. Please try again.');
    }
  }
  async function run(fn) {
    if (pending) return;
    pending=true; say(text('처리 중…','Working…'));
    dialog.setAttribute('aria-busy','true');
    const buttons=[...content.querySelectorAll('button:not(:disabled)')];
    buttons.forEach(b=>b.disabled=true);
    try { await fn(); }
    catch(error) {
      if (error.code==='SIGNUP4005') {ticket=null;render(page==='verify'?'signup':'reset');}
      if (error.code==='SOCIAL4004') {social=null;render('login');}
      if (error.code==='SIGNUP4292' && error.detail?.retryAfterSeconds===0 && ticket) {
        ticket=null;render(page==='verify'?'signup':'reset');
      }
      if (error.detail?.retryAfterSeconds>0) nextSend=Date.now()+error.detail.retryAfterSeconds*1000;
      say(describe(error),true);
    } finally {
      pending=false; dialog.removeAttribute('aria-busy'); buttons.forEach(b=>b.disabled=false); tick();
    }
  }
  function finish(result,fallback,remember=keep) { auth.accept(result,remember,fallback); dialog.close(); }
  function startPage(next) { ticket=null; social=null;render(next); }
  content.addEventListener('change',event=>{
    const f=form(),target=event.target;
    if (target.name==='keep') keep=target.checked;
    if (target.name==='all') {f.elements.terms.checked=target.checked;f.elements.privacy.checked=target.checked;}
    if (['terms','privacy'].includes(target.name)) f.elements.all.checked=f.elements.terms.checked&&f.elements.privacy.checked;
  });
  content.addEventListener('click',event=>{
    const btn=event.target.closest('button');
    if (!btn||pending) return;
    if (btn.dataset.provider) {
      const item=providers.find(p=>p.provider===btn.dataset.provider);
      if (!auth.enabled(item)) {say(btn.title);return;}
      run(()=>auth.startOAuth(item,page==='login' && keep));
    } else if (btn.dataset.action==='resend') {
      if(!ticket||Date.now()<nextSend)return;
      run(async()=>{
        setTicket(await auth.request('/api/auth/'+(page==='verify'?'email/signup':'password/reset')+'/resend',{verificationToken:ticket}));
        say(text('메일함에서 새 코드를 확인해 주세요.','Check your inbox for the new code.'));
      });
    } else if (btn.dataset.page||btn.dataset.action) startPage(btn.dataset.page||btn.dataset.action);
  });
  content.addEventListener('submit',event=>{
    event.preventDefault();
    const f=form(),data=new FormData(f),val=name=>String(data.get(name)||'');
    if (f.elements.confirm && val('confirm')!==val('password')) {
      say(text('비밀번호가 일치하지 않습니다.','Passwords do not match.'),true);f.elements.confirm.focus();return;
    }
    run(async()=>{
      if (page==='login') {
        const loginId=val('loginId').trim();
        const result=await auth.request('/api/auth/login',{loginId,password:val('password'),keepLoggedIn:keep});
        if (result?.mfaRequired) {say(describe({code:'AUTH4005'}),true);return;}
        finish(result,loginId);
      } else if (page==='signup') {
        setTicket(await auth.request('/api/auth/email/signup',{email:val('email').trim(),nickname:val('nickname').trim(),password:val('password'),agreements:auth.agreements}));
        render('verify',text('입력한 메일로 안내를 보냈습니다.','Check your inbox for instructions.'));
      } else if (page==='verify') {
        finish(await auth.request('/api/auth/email/signup/verify',{verificationToken:ticket,code:val('code'),keepLoggedIn:false}),undefined,false);
      } else if (page==='reset') {
        setTicket(await auth.request('/api/auth/password/reset',{email:val('email').trim()}));
        render('newPassword',text('가입된 메일이면 코드를 보냈습니다.','If this email is registered, we sent a code.'));
      } else if (page==='newPassword') {
        await auth.request('/api/auth/password/reset/confirm',{verificationToken:ticket,code:val('code'),newPassword:val('password')});
        ticket=null;render('login',text('비밀번호를 바꿨습니다. 다시 로그인해 주세요.','Password changed. Please log in again.'));
      } else if (page==='consent') {
        finish(await auth.request('/api/auth/social/signup',{signupToken:social.signupToken,agreements:auth.agreements,keepLoggedIn:keep}));
      } else if (page==='account') {
        await auth.logout();dialog.close();
      }
    });
  });
  function paintHeader() {
    const user=auth.session;
    openButton.textContent=user?(user.name||title('account'))+' ▾':title('login');
    openButton.toggleAttribute('data-member',Boolean(user));
    credit.hidden=!user||!Number.isFinite(balance);
    credit.textContent=credit.hidden?'':text('크레딧 ','Credits ')+balance.toLocaleString(document.documentElement.lang);
  }
  async function updateAccount() {
    const revision=++headerRevision, current=auth.session;
    balance=null;paintHeader();
    if (!current) { if (dialog.open && page==='account' && !pending) render('login'); return; }
    try {
      const wallet=await auth.wallet();
      if (revision===headerRevision && current===auth.session) {balance=wallet?.available;walletCheckedAt=Date.now();paintHeader();}
    } catch { /* Balance can be unavailable independently of sign-in. */ }
  }
  function open(next) {
    if (!dialog.open) dialog.showModal();
    render(next);
    if (next!=='account') getProviders();
  }
  openButton.addEventListener('click',()=>open(auth.session?'account':'login'));
  closeButton.addEventListener('click',()=>{if(!pending) dialog.close();});
  dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
  dialog.addEventListener('click',event=>{if(!pending && event.target===dialog) {
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close();
  }});
  dialog.addEventListener('close',()=>{if(dialog.open)return;clearInterval(clock);ticket=null;social=null;content.replaceChildren();say();openButton.focus();});
  new MutationObserver(paintHeader).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  window.addEventListener('nuridot-session',updateAccount);
  function checkActiveSession() {
    if (auth.session && (!Number.isFinite(balance) || Date.now()-walletCheckedAt>=60000)) updateAccount();
  }
  window.addEventListener('focus',checkActiveSession);
  window.addEventListener('pageshow',event=>{if(event.persisted) updateAccount();});
  setInterval(()=>{if (!document.hidden) checkActiveSession();}, 3600000);
  updateAccount();
  if (sessionStorage.getItem('nuridot.oauth.v1.response')) {
    open('login');
    run(async()=>{
      const exchange=await auth.finishOAuth();
      if (!exchange) return;
      keep=exchange.keep;
      if (exchange.result.status==='SIGNUP_REQUIRED' && exchange.result.signupToken) {
        social=exchange.result;render('consent');
      } else if (exchange.result.status==='LOGGED_IN') finish(exchange.result);
      else throw new Error('Unknown social login status');
    });
  }
})();
