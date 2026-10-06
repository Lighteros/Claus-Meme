(() => {
 if(!document.getElementById('public-posts'))return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let timer,loading=false,widgets;
 const visible=()=>!document.hidden&&document.body.dataset.view==='notes';
 const link=(text,href)=>{const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
 function textWithLinks(p,text) {
 let end=0;
 for(const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
 p.append(document.createTextNode(text.slice(end,match.index)));
 let value=match[0],tail='';
 while(/[.,;!?)]$/.test(value)){tail=value.at(-1)+tail;value=value.slice(0,-1);}
 p.append(link(value.replace(/^https?:\/\//,''),value),document.createTextNode(tail));end=match.index+match[0].length;
 }
 p.append(document.createTextNode(text.slice(end)));
 }
 function loadWidgets() {
 if(widgets)return widgets;
 widgets=new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.src='https://platform.twitter.com/widgets.js';script.async=true;
 const timeout=setTimeout(()=>reject(Error('embed_timeout')),12000);
 script.onload=()=>{clearTimeout(timeout);if(window.twttr?.ready)window.twttr.ready(resolve);else reject(Error('embed_unavailable'));};
 script.onerror=()=>{clearTimeout(timeout);reject(Error('embed_unavailable'));};
 document.head.append(script);
 });
 return widgets;
 }
 function makeStream(key) {
 const list=document.getElementById('public-'+key),viewport=list.closest('.posts-window'),status=document.getElementById(key+'-status');
 const cards=new Map();let loaded=false,embedSequence=0;
 const fallbackUrl=key==='replies'?'https://x.com/ClausAgent/with_replies':'https://x.com/ClausAgent';
 async function embed(card) {
 if(card.dataset.requested||!visible()||viewport.clientWidth<250)return;
 const attempt=String(++embedSequence);card.dataset.requested=attempt;observer.unobserve(card);
 try {
 const api=await loadWidgets();
 if(!card.isConnected||card.dataset.requested!==attempt)return;
 const holder=card.querySelector('.post-embed');
 // Keep the complete fallback in place until X has finished rendering.
 holder.style.position='absolute';holder.style.width='100%';holder.style.visibility='hidden';
 const rendered=await api.widgets.createTweet(card.dataset.postId,holder,{theme:'dark',dnt:true,conversation:'none',align:'center',width:Math.floor(viewport.clientWidth-6)});
 if(!holder.isConnected||card.dataset.requested!==attempt)return;
 if(!rendered){holder.replaceChildren();return;}
 const oldHeight=card.offsetHeight,aboveReadingPosition=viewport.scrollTop>8&&card.getBoundingClientRect().bottom<viewport.getBoundingClientRect().top;
 card.dataset.embedded='true';holder.removeAttribute('style');
 if(aboveReadingPosition)viewport.scrollTop+=card.offsetHeight-oldHeight;
 }catch {if(card.dataset.requested===attempt)card.querySelector('.post-embed')?.replaceChildren();}
 }
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)embed(entry.target);},{root:viewport,rootMargin:'100px 0px'});
 let previousWidth=viewport.clientWidth,resizeTimer;
 const resize=new ResizeObserver(()=>{
 const width=viewport.clientWidth;if(!width||Math.abs(width-previousWidth)<4)return;
 previousWidth=width;clearTimeout(resizeTimer);
 resizeTimer=setTimeout(()=>{for(const card of cards.values()){
 observer.unobserve(card);delete card.dataset.requested;delete card.dataset.embedded;
 const holder=document.createElement('div');holder.className='post-embed';card.querySelector('.post-embed').replaceWith(holder);
 observer.observe(card);
 }},180);
 });resize.observe(viewport);
 function makeCard(post) {
 const card=document.createElement('article');card.className='public-post';card.dataset.postId=post.id;card.tabIndex=-1;card.setAttribute('aria-label',key==='replies'?'Claus reply':'Claus post');
 const fallback=document.createElement('div');fallback.className='post-fallback';
 const byline=document.createElement('div');byline.className='post-byline';
 const time=document.createElement('time');time.dateTime=post.createdAt;time.textContent=new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(post.createdAt));
 const date=link('',post.url);date.append(time);byline.append(link('Claus',post.url),date);
 const text=document.createElement('p');textWithLinks(text,post.text);fallback.append(byline,text);
 const media=document.createElement('div');media.className='post-media';
 for(const m of (post.media??[]).slice(0,4)) {
 if(!/^https:\/\/pbs\.twimg\.com\//.test(m.url))continue;
 const a=link('',post.url),img=document.createElement('img');img.src=m.url;img.alt=m.alt||(m.type==='video'?'Video in Claus’s post':'Image in Claus’s post');img.loading='lazy';img.decoding='async';
 if(m.width>0&&m.height>0){img.width=m.width;img.height=m.height;}a.append(img);media.append(a);
 }
 if(media.children.length)fallback.append(media);
 if(post.replyToUrl){const parent=link('View conversation',post.replyToUrl);parent.className='post-quote';fallback.append(parent);}
 if(post.quoteUrl){const quote=link('Quoted post',post.quoteUrl);quote.className='post-quote';fallback.append(quote);}
 const holder=document.createElement('div');holder.className='post-embed';card.append(fallback,holder);return card;
 }
 function render(feed) {
 const posts=(feed[key]??[]).filter(p=>/^\d{1,19}$/.test(p.id)&&typeof p.text==='string'&&Number.isFinite(Date.parse(p.createdAt))&&p.url===`https://x.com/ClausAgent/status/${p.id}`);
 const anchor=list.firstElementChild,oldTop=anchor?.offsetTop??0,oldScroll=viewport.scrollTop;
 const seen=new Set(posts.map(p=>p.id));let added=0;
 for(const [id,card] of cards)if(!seen.has(id)){observer.unobserve(card);card.remove();cards.delete(id);}
 let previous=null;
 for(const [index,post] of posts.entries()) {
 let card=cards.get(post.id);
 const version=JSON.stringify(post);
 if(card&&card.dataset.version!==version){observer.unobserve(card);card.remove();cards.delete(post.id);card=null;}
 if(!card){card=makeCard(post);card.dataset.version=version;cards.set(post.id,card);added++;}
 if(previous?previous.nextElementSibling!==card:list.firstElementChild!==card)list.insertBefore(card,previous?previous.nextElementSibling:list.firstChild);
 card.setAttribute('aria-posinset',String(index+1));card.setAttribute('aria-setsize',String(posts.length));previous=card;
 }
 if(loaded&&added&&anchor?.isConnected) {
 const shift=anchor.offsetTop-oldTop;
 if(oldScroll>8)viewport.scrollTop=oldScroll+shift;
 else if(!reduced.matches&&shift>0)list.animate([{transform:`translateY(${-shift}px)`},{transform:'translateY(0)'}],{duration:1100,easing:'cubic-bezier(.22,.65,.25,1)'});
 }
 status.hidden=posts.length>0;status.replaceChildren(link(key==='replies'?'View replies on X':'View posts on X',fallbackUrl));
 loaded=true;
 for(const card of cards.values())if(!card.dataset.requested)observer.observe(card);
 }
 return {render,fail(){if(!loaded){status.replaceChildren(link(key==='replies'?'View replies on X':'View posts on X',fallbackUrl));status.hidden=false;}}};
 }
 const streams=[makeStream('posts'),makeStream('replies')];
 async function refresh() {
 clearTimeout(timer);if(!visible()||loading)return;
 loading=true;
 try {const r=await fetch('/posts.json',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('feed_unavailable');const feed=await r.json();if(feed?.account?.id!=='2105791902952067072'||!Array.isArray(feed.posts)||!Array.isArray(feed.replies))throw Error('invalid_feed');for(const stream of streams)stream.render(feed);}
 catch {for(const stream of streams)stream.fail();}
 finally {loading=false;if(visible())timer=setTimeout(refresh,60000);}
 }
 window.addEventListener('claus:view',refresh);
 document.addEventListener('visibilitychange',refresh);
 refresh();
})();
