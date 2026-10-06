(() => {
 const views = ['weather', 'burn', 'liquidity', 'funding'];
 const $ = id => document.getElementById(id);
 let timer, request, snapshot;
 const visible = () => views.includes(document.body.dataset.view) && !document.hidden;
 const percent = pips => (pips / 10000).toFixed(2) + '%';
 const time = value => new Date(value).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'}) + ' UTC';
 function show(data) {
 const {fees, weather} = data;
 $('burn-explanation').textContent = `${percent(fees.burn)} of the ETH value of main-pool trades currently funds these buybacks, from the 2% project fee.`;
 $('liquidity-explanation').textContent = `${percent(fees.liquidity)} of the ETH value of main-pool trades currently funds liquidity, from the 2% project fee. Each successful batch deepens the original pool.${data.processing?.separateLiquidity ? ' Batches run separately, so traders do not pay the batch gas.' : ''}`;
 $('funding-wallet').textContent = percent(fees.wallet);
 $('funding-nft-row').hidden = !data.processing?.nftRewards;
 $('funding-nft').textContent = percent(fees.nft ?? 0);
 $('funding-fomo').textContent = percent(fees.fomo);
 $('funding-weather').textContent = percent(fees.burn + fees.liquidity);
 $('funding-status').hidden = true;
 $('funding-article').removeAttribute('aria-busy');
 for (const el of document.querySelectorAll('[data-weather-link]')) el.hidden = !weather.active;
 $('weather-mode').textContent = {not_active: 'Not active yet', fallback: 'Usual split', dry: 'Dry in London', rain: 'Rain in London'}[weather.mode];
 $('weather-burn').textContent = percent(fees.burn);
 $('weather-liquidity').textContent = percent(fees.liquidity);
 $('weather-observation').textContent = weather.active && weather.mode !== 'fallback'
 ? `Heathrow observation · ${time(weather.observedAt)}`
 : weather.active ? 'No fresh signed weather report.' : 'The current hook still uses the usual split.';
 $('weather-article').dataset.weather = weather.mode;
 $('weather-status').hidden = true;
 $('weather-article').removeAttribute('aria-busy');
 }
 async function refresh() {
 clearTimeout(timer);
 if (!visible() || request) return;
 const controller = new AbortController(); request = controller;
 let received = false;
 const timeout = setTimeout(() => controller.abort(), 15000);
 try {
 const response = await fetch('/fee-state.json', {cache: 'no-store', signal: controller.signal});
 if (!response.ok) throw Error('Unavailable');
 const d = await response.json();
 const observedAt = Date.parse(d.observedAt);
 const usesReport = ['rain', 'dry'].includes(d.weather?.mode);
 if (d.chainId !== 1 || d.hook !== '0x37Bfb8AC7C960E558657871D41Ca70E07e7DbfFf' || d.fees.total !== 23000 ||
 ![1500, 2500, 3500].includes(d.fees.burn) || d.fees.burn + d.fees.liquidity !== 5000 ||
 !['not_active', 'fallback', 'dry', 'rain'].includes(d.weather.mode) ||
 !Number.isFinite(observedAt) || Date.now() - observedAt > 180000 || observedAt > Date.now() + 30000 ||
 usesReport && (!Number.isFinite(Date.parse(d.weather.observedAt)) || !Number.isFinite(Date.parse(d.weather.validUntil)))) throw Error('Invalid snapshot');
 if (!visible() || request !== controller) return;
 snapshot = d; received = true; show(d);
 } catch {
 if (visible() && request === controller) {
 $('weather-status').hidden = false;
 $('weather-status').textContent = snapshot ? 'Last confirmed split · retrying' : 'Current split unavailable · retrying';
 $('funding-status').hidden = false;
 $('funding-status').textContent = snapshot ? 'Last confirmed split · retrying' : 'Current split unavailable · retrying';
 // Do not leave a stale percentage in explanatory prose after a reader outage.
 $('burn-explanation').textContent = 'A share of main-pool trading fees buys back $CLAUS and burns it. The current fee split is temporarily unavailable.';
 $('liquidity-explanation').textContent = 'Main-pool trading fees fund liquidity. At roughly $500, it adds ETH and $CLAUS to the original pool. The current fee split is temporarily unavailable.';
 }
 } finally {
 clearTimeout(timeout);
 if (request === controller) {
 request = null;
 const expiry = received && snapshot && ['rain', 'dry'].includes(snapshot.weather.mode) ? Date.parse(snapshot.weather.validUntil) - Date.now() : 60000;
 if (visible()) timer = setTimeout(refresh, Math.max(1000, Math.min(60000, expiry)));
 }
 }
 }
 function resume() {
 clearTimeout(timer);
 if (!visible()) {request?.abort(); request = null; return;}
 refresh();
 }
 window.addEventListener('claus:view', resume);
 document.addEventListener('visibilitychange', resume);
 resume();
})();
