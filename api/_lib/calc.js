// The Excel's money rules, in one place.
//   ফেরত      = product returns + money-only deductions (adjust)
//   নিট সেল   = sales − ফেরত − (damage, only on days where "damage deduct" is on)
//   আন্ডার/ওভার = memo − sales
//   কমিশন     = net sales × commission %
const { r2 } = require('./db');

function dayNumbers(r) {
  const ret = r2(Number(r.returns) + Number(r.adjust));
  const dmgCut = r.dmg_deduct ? Number(r.damage) : 0;
  const sales = Number(r.sales), memo = Number(r.memo);
  return {
    date: r.d, sales, returns: ret, damage: Number(r.damage), damageCut: dmgCut,
    memo, underOver: r2(memo - sales), net: r2(sales - ret - dmgCut),
    closed: !!r.closed, lines: r.line_count
  };
}

function total(days) {
  const t = { sales: 0, returns: 0, damage: 0, damageCut: 0, memo: 0, underOver: 0, net: 0, activeDays: 0 };
  days.forEach((d) => {
    t.sales += d.sales; t.returns += d.returns; t.damage += d.damage; t.damageCut += d.damageCut;
    t.memo += d.memo; t.underOver += d.underOver; t.net += d.net;
    if (d.sales > 0 || d.memo > 0) t.activeDays++;
  });
  Object.keys(t).forEach((k) => { t[k] = r2(t[k]); });
  return t;
}

// Money with the company: code balance and "still to pay" (Excel: Code + Account Balance)
function ledgerTotals(rows) {
  const t = { opening: 0, payout: 0, received: 0 };
  rows.forEach((x) => { t[x.kind] += Number(x.amount); });
  return {
    payout: r2(t.payout), received: r2(t.received), opening: r2(t.opening),
    codeBalance: r2(t.opening + t.payout - t.received)
  };
}

module.exports = { dayNumbers, total, ledgerTotals };
