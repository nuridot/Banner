(function(){
  document.documentElement.classList.add('js');
  var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(window.GA_ON&&/^G-[A-Z0-9]+$/.test(window.GA_ID||'')){
    var s=document.createElement('script');s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+window.GA_ID;document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};
    gtag('js',new Date());gtag('config',window.GA_ID,{anonymize_ip:true});
  }

  var m=document.getElementById('menu'),g=document.getElementById('gnb');
  m.addEventListener('click',function(){var o=g.classList.toggle('open');
    m.setAttribute('aria-expanded',o?'true':'false');m.setAttribute('aria-label',o?'메뉴 닫기':'메뉴 열기')});
  g.addEventListener('click',function(e){if(e.target.tagName==='A'){g.classList.remove('open');m.setAttribute('aria-expanded','false')}});

  var all=[].slice.call(document.querySelectorAll('.rv,.scene'));
  if(RM||!('IntersectionObserver' in window)){all.forEach(function(n){n.classList.add('on')})}
  else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}})},
    {rootMargin:'0px 0px -10% 0px',threshold:.08});
    all.forEach(function(n){io.observe(n)});
    document.getElementById('s1').classList.add('on');}

  /* 머리가 줄어든다 */
  (function(){
    var root=document.documentElement,tick=false;
    function frame(){tick=false;root.classList.toggle('sticky',scrollY>40)}
    addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(frame)}},{passive:true});
    frame();
  })();


  var sts=[].slice.call(document.querySelectorAll('#steps .st'));
  var figs=[].slice.call(document.querySelectorAll('#viz figure'));
  function pick(i){sts.forEach(function(s){s.classList.toggle('on',+s.dataset.i===i)});
    figs.forEach(function(f){f.classList.toggle('on',+f.dataset.i===i)})}
  sts.forEach(function(s){s.setAttribute('tabindex','0');s.setAttribute('role','button');
    s.addEventListener('mouseenter',function(){pick(+s.dataset.i)});
    s.addEventListener('focus',function(){pick(+s.dataset.i)});
    s.addEventListener('click',function(){pick(+s.dataset.i);sts.forEach(function(o){o.classList.toggle('tap',o===s)})});
    s.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(+s.dataset.i)}})});

  /* 움직임 줄이기를 선택한 경우 로고 띠도 멈춘다. */
  (function(){
    var mq=document.querySelector('.mq'),tr=document.querySelector('.mq-track');
    if(!mq||!tr||RM)return;
    var x=0,last=0,w=0,SPEED=48,run=true;
    function size(){w=tr.getBoundingClientRect().width}
    function step(t){
      if(!last)last=t;
      var dt=Math.min((t-last)/1000,.05);last=t;
      if(run&&w>0){x-=SPEED*dt;if(-x>=w)x+=w;
        mq.style.setProperty('--mqx',x.toFixed(2)+'px')}
      requestAnimationFrame(step)}
    size();addEventListener('resize',size);
    document.addEventListener('visibilitychange',function(){run=!document.hidden;last=0});
    requestAnimationFrame(step);
  })();

  var KEY='nuridot.lang',btn=document.getElementById('lang'),cur='ko';
  var ns=[].slice.call(document.querySelectorAll('[data-en]'));
  ns.forEach(function(n){n.dataset.ko=n.innerHTML});
  function ap(l){cur=l;document.documentElement.lang=(l==='en'?'en':'ko');
    ns.forEach(function(n){n.innerHTML=(l==='en'?n.dataset.en:n.dataset.ko)});
    btn.textContent=(l==='en'?'한국어':'EN');
    btn.setAttribute('aria-label',l==='en'?'Switch to Korean':'Switch to English');
    try{localStorage.setItem(KEY,l)}catch(e){}}
  try{if(localStorage.getItem(KEY)==='en')ap('en')}catch(e){}
  var bb=document.getElementById('brl'),bon=false,bns=null,borig=null;
  function bnodes(){
    var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
      if(!/[\uac00-\ud7a3A-Za-z0-9]/.test(n.nodeValue))return NodeFilter.FILTER_REJECT;
      for(var p=n.parentNode;p&&p!==document.body;p=p.parentNode){
        var t=p.nodeName.toLowerCase();
        if(t==='script'||t==='style'||t==='svg')return NodeFilter.FILTER_REJECT;
        if(p.hasAttribute&&p.hasAttribute('data-nobr'))return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;}});
    var a=[],n;while(n=w.nextNode())a.push(n);return a;}
  function bset(v){
    if(v){
      if(cur!=='ko')ap('ko');
      var B=window.BRL||[];bns=bnodes();
      if(bns.length!==B.length){console.warn('점자 자료 개수 불일치',bns.length,B.length);bns=null;return}
      borig=bns.map(function(n){return n.nodeValue});
      bns.forEach(function(n,i){n.nodeValue=B[i]});
      document.documentElement.classList.add('brl');
    }else if(bns){
      bns.forEach(function(n,i){n.nodeValue=borig[i]});
      document.documentElement.classList.remove('brl');bns=null}
    bon=v;bb.textContent=v?'한글':'점자';bb.setAttribute('aria-pressed',v?'true':'false');
    bb.setAttribute('aria-label',v?'한글로 보기':'점자로 보기');}
  bb.addEventListener('click',function(){bset(!bon)});
  btn.addEventListener('click',function(){if(bon)bset(false);ap(cur==='en'?'ko':'en')});

  var si=document.getElementById('seg-ind'),so=document.getElementById('seg-org');
  var pi=document.getElementById('plans-ind'),po=document.getElementById('plans-org');
  function seg(ind){
    si.classList.toggle('on',ind); so.classList.toggle('on',!ind);
    si.setAttribute('aria-selected',ind?'true':'false');
    so.setAttribute('aria-selected',ind?'false':'true');
    si.tabIndex=ind?0:-1; so.tabIndex=ind?-1:0;
    pi.hidden=!ind; po.hidden=ind;
    (ind?pi:po).classList.add('on');
  }
  si.addEventListener('click',function(){seg(true)});
  so.addEventListener('click',function(){seg(false)});
  seg(true);
  [si,so].forEach(function(tab){tab.addEventListener('keydown',function(e){
    if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)===-1)return;
    e.preventDefault();
    var ind=e.key==='Home'||(e.key!=='End'&&tab===so);
    seg(ind);(ind?si:so).focus();
  })});

  var f=document.getElementById('inq'),fm=document.getElementById('fmsg');
  var sending=false,send=f.querySelector('button[type="submit"]');
  var API_BASE=(window.__API_BASE__||'https://api.semojum.app').replace(/\/+$/,'');
  var inquiryType=document.getElementById('inquiry-type'),other=document.getElementById('inquiry-other');
  var inquiryLabels={PURCHASE:'구매 문의',TRIAL:'체험 문의',SUGGESTION:'건의사항',ETC:'기타 (직접 입력)'};
  function syncInquiryType(){
    var isOther=inquiryType.value==='ETC';
    document.getElementById('inquiry-other-field').hidden=!isOther;
    other.disabled=!isOther;other.required=isOther;
    if(!isOther)other.value='';
  }
  inquiryType.addEventListener('change',syncInquiryType);
  syncInquiryType();
  function value(id){return document.getElementById(id).value.trim()}
  function status(ko,en,bad){
    fm.style.color=bad?'#b3261e':'var(--accent-d)';
    fm.textContent=cur==='en'?en:ko;
  }
  f.addEventListener('submit',async function(e){e.preventDefault();if(sending)return;var bad=null;
    ['org','who','em'].forEach(function(id){var x=document.getElementById(id);if(!x.value.trim()&&!bad)bad=x});
    if(!bad){var em=document.getElementById('em');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value('em')))bad=em}
    ['org','who','em','tel','msg'].forEach(function(id){var x=document.getElementById(id);
      if(x.maxLength>0&&x.value.length>x.maxLength&&!bad)bad=x});
    if(!bad&&!Object.prototype.hasOwnProperty.call(inquiryLabels,inquiryType.value))bad=inquiryType;
    if(!bad&&inquiryType.value==='ETC'&&(!value('inquiry-other')||other.value.length>other.maxLength))bad=other;
    if(!bad&&!document.getElementById('ag').checked)bad=document.getElementById('ag');
    if(bad){fm.style.color='#b3261e';
      fm.textContent=(cur==='en'?'Please fill in the required fields.':'필요한 칸을 채워 주십시오.');bad.focus();return}
    var label=inquiryLabels[inquiryType.value];
    var lines=['문의 유형: '+label,'기관명: '+value('org')];
    if(value('tel'))lines.push('전화: '+value('tel'));
    if(value('pg'))lines.push('월 처리 쪽수: '+value('pg'));
    lines.push('','문의 사항:',value('msg')||label);
    var payload={type:inquiryType.value,title:inquiryType.value==='ETC'?value('inquiry-other'):label,
      name:value('who'),email:value('em'),
      message:lines.join('\n'),website:value('website')};
    if(payload.message.length>2000){
      status('문의 내용을 조금 줄여 주세요.','Please shorten your message.',true);return;
    }
    sending=true;send.disabled=true;f.setAttribute('aria-busy','true');
    status('보내는 중…','Sending…');
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},15000);
    try{
      var response=await fetch(API_BASE+'/api/public/inquiries',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),signal:controller.signal
      });
      var raw=await response.text(),data={};
      try{data=raw?JSON.parse(raw):{}}catch(_){throw new Error('Invalid response')}
      if(response.ok&&data.isSuccess!==false){
        f.reset();syncInquiryType();
        status('문의가 접수되었습니다. 영업일 하루 안에 회신드리겠습니다.',
          'Your inquiry has been received. We will reply within one business day.');
      }else if(response.status===429){
        status('요청이 많습니다. 잠시 후 다시 시도해 주세요.',
          'Too many requests. Please try again later.',true);
      }else{
        status('접수에 실패했습니다. 잠시 후 다시 시도해 주세요.',
          'Sending failed. Please try again later.',true);
      }
    }catch(error){
      status('전송을 완료하지 못했습니다. 잠시 후 다시 시도하거나 contact@nuridot.com으로 문의해 주세요.',
        'Could not send. Please try again or email contact@nuridot.com.',true);
    }finally{
      clearTimeout(timer);sending=false;send.disabled=false;f.removeAttribute('aria-busy');
    }
  });
})();
