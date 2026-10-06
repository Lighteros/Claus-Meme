(() => {
 const token = '0xb18a4bcf9018bedb1fcb90ed80f87087151c09f4';
 const recipient = '0x04F1E9F9848C92508699BFcd59e0522e8246DC16';
 const eth = n => {const v=BigInt(n);return (v/10n**18n).toString()+'.'+(v%10n**18n).toString().padStart(18,'0').slice(0,4);};
 const whole = n => (BigInt(n) / 10n ** 18n).toLocaleString('en-US');
 function validate(data) {
 if (data?.chainId !== 1 || data.token !== token || data.decimals !== 18 || data.measurement !== 'successful_hook_events' ||
 data.fomo?.recipient !== recipient || data.liquidity?.tokenId !== 433751 ||
 data.liquidity.measurement !== 'cumulative_hook_deposits_not_current_pool_balance' ||
 !/^\d+$/.test(data.liquidity.batchThresholdEth) ||
 !/^\d+$/.test(data.liquidity.pendingEth)) throw Error('Invalid hook snapshot');
 return data;
 }
 window.ClausCounter({view:'buybacks', endpoint:'/hook-stats.json', validate,
 metrics:[{id:'buybacks-total',value:d=>d.fomo.tokensDelivered},{id:'buybacks-eth',decimals:4,value:d=>d.fomo.ethSpent}],
 show(data) {
 document.getElementById('buybacks-share').hidden = false;
 return whole(data.fomo.tokensDelivered) + ' $CLAUS bought and delivered to the Fomo wallet.';
 }
 });
 window.ClausCounter({view:'liquidity', endpoint:'/hook-stats.json', validate,
 metrics:[{id:'liquidity-total',decimals:4,value:d=>d.liquidity.ethAdded},{id:'liquidity-tokens',value:d=>d.liquidity.tokensAdded},{id:'liquidity-pending',decimals:4,value:d=>d.liquidity.pendingEth}],
 show(data) {
 document.getElementById('liquidity-share').hidden = false;
 document.getElementById('liquidity-pair').hidden = false;
 const pending = BigInt(data.liquidity.pendingEth), threshold = BigInt(data.liquidity.batchThresholdEth);
 const percentage = threshold ? Number((pending < threshold ? pending : threshold) * 10000n / threshold) / 100 : null;
 const progress = document.getElementById('liquidity-progress');
 progress.hidden = percentage === null;
 if (percentage !== null) {
 progress.value = percentage;
 progress.setAttribute('aria-valuetext', `${Math.floor(percentage)}% of the approximately $500 threshold`);
 }
 document.getElementById('liquidity-progress-percent').textContent = percentage === null ? '—' : Math.floor(percentage) + '%';
 document.getElementById('liquidity-progress-target').textContent = !threshold ? 'Awaiting a fresh ETH price' : pending >= threshold ? 'Threshold reached · awaiting a successful batch' : 'Target ≈ $500';
 return eth(data.liquidity.ethAdded) + ' ETH and ' + whole(data.liquidity.tokensAdded) + ' $CLAUS added to liquidity across ' + data.liquidity.batches + ' completed batches.';
 }
 });
})();
