window.ClausCounter({
 view: 'burn', endpoint: '/burn.json',
 metrics: [{id: 'burn-total', value: data => data.burned}],
 validate(data) {
 if (data?.chainId !== 1 || data.decimals !== 18 || data.token !== '0xb18a4bcf9018bedb1fcb90ed80f87087151c09f4' ||
 data.measurement !== 'initial_supply_minus_total_supply' ||
 !['burned','totalSupply','initialSupply'].every(k => /^\d+$/.test(data[k])) ||
 BigInt(data.initialSupply) !== 1_000_000_000n * 10n ** 18n ||
 BigInt(data.burned) + BigInt(data.totalSupply) !== BigInt(data.initialSupply)) throw Error('Invalid burn total');
 return data;
 },
 show(data) {
 const share = document.getElementById('burn-share');
 const percent = Number(BigInt(data.burned) * 1000000n / BigInt(data.initialSupply)) / 10000;
 share.textContent = percent.toLocaleString('en-US', {minimumFractionDigits:4, maximumFractionDigits:4}) + '% of the original supply';
 share.hidden = false;
 return (BigInt(data.burned) / 10n ** 18n).toLocaleString('en-US') + ' $CLAUS burned. ' + share.textContent + '.';
 }
});
