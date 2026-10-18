// Player profile — live stats from the club Google Sheet.
// Usage: player.html?n=<player name as it appears in the score sheet>
(function () {
  var root = document.getElementById('player-root');
  if (!root) return;
  root.innerHTML = '<div class="lb-loading">Loading player profile…</div>';

  var SHEET = '1iwTDGnrZS69bOU5AdxDGS2q_tFVCgi6I5M5v6arG8hs';
  var who = new URLSearchParams(location.search).get('n') || '';

  function fetchTab(sheetName, cb) {
    window.google = { visualization: { Query: { setResponse: function (r) {
      var out = [];
      if (r && r.table) {
        r.table.rows.forEach(function (rw) {
          out.push((rw.c || []).map(function (c) { return c ? { v: c.v, f: c.f } : null; }));
        });
      }
      cb(out);
    } } } };
    var s = document.createElement('script');
    s.src = 'https://docs.google.com/spreadsheets/d/' + SHEET + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetName);
    s.onerror = function () { cb(null); };
    document.head.appendChild(s);
  }

  fetchTab('Ranking_ALL', function (rankRows) {
    fetchTab('Ranking', function (nameRows) {
      fetchTab('4. Score Table', function (scoreRows) {
        if (!scoreRows) { root.innerHTML = '<div class="lb-loading">Could not load stats right now — try again later.</div>'; return; }
        build(rankRows || [], nameRows || [], scoreRows);
      });
    });
  });

  function build(rankRows, nameRows, rows) {
    // --- photo + display name map from Ranking_ALL (cols: 21 name, 22 photo) ---
    var photos = {}, fullNames = {};
    rankRows.forEach(function (r) {
      var n = (r[21] && r[21].v || '').toString().trim(), link = (r[22] && r[22].v || '').toString().trim();
      if (!n || !link) return;
      photos[n.toLowerCase()] = link;
      var m = link.match(/[?&]name=([^&]+)/);
      if (m) fullNames[n.toLowerCase()] = decodeURIComponent(m[1].replace(/\+/g, ' '));
    });
    var rankFull = {};
    nameRows.forEach(function (r) {
      var full = (r[1] && r[1].v || '').toString().trim(), short = (r[2] && r[2].v || '').toString().trim();
      if (!full || !short) return;
      rankFull[short.toLowerCase()] = full; rankFull[full.toLowerCase()] = full;
    });
    function photoFor(name) {
      var k = name.toLowerCase();
      if (photos[k]) return photos[k];
      var first = k.split(' ')[0];
      for (var key in photos) if (key.split(' ')[0] === first) return photos[key];
      return 'https://ui-avatars.com/api/?background=b6e63e&color=060f24&size=160&format=svg&bold=true&name=' + encodeURIComponent(name);
    }
    function displayName(name) {
      var k = name.toLowerCase();
      if (rankFull[k]) return rankFull[k];
      if (fullNames[k]) return fullNames[k];
      var first = k.split(' ')[0];
      for (var key in rankFull) if (key.split(' ')[0] === first) return rankFull[key];
      for (var key in fullNames) if (key.split(' ')[0] === first) return fullNames[key];
      return name;
    }

    // --- parse score rows ---
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    function parseDate(s) {
      var m = /(\d{1,2})-([A-Za-z]+)-(\d{2,4})/.exec(s || '');
      if (!m) return null;
      var mi = months.indexOf(m[2]); if (mi < 0) return null;
      var y = +m[3]; if (y < 100) y += 2000;
      return new Date(y, mi, +m[1]);
    }
    var matches = [], seen = {};
    rows.forEach(function (r) {
      var v = function (i) { return r[i] && r[i].v != null ? r[i].v : ''; };
      var f = function (i) { return r[i] && r[i].f != null ? r[i].f : v(i); };
      if (!v(0) && !f(0)) return;
      var d = parseDate(f(0)); if (!d) return;
      var key = f(0) + '|' + v(1) + '|' + v(2);
      if (seen[key]) return; seen[key] = 1;
      var teamA = [v(3), v(4)].map(function (x) { return (x || '').toString().trim(); });
      var teamB = [v(5), v(6)].map(function (x) { return (x || '').toString().trim(); });
      var sa = +v(7), sb = +v(8), pa = v(9), pb = v(10);
      var aWin = null;
      if (pa === '10' || pa === 10) aWin = true;
      else if (pb === '10' || pb === 10) aWin = false;
      else if (!isNaN(sa) && !isNaN(sb) && sa !== sb) aWin = sa > sb;
      if (aWin === null) return;
      matches.push({ d: d, court: +v(1) || 0, teamA: teamA, teamB: teamB, aWin: aWin, sa: sa, sb: sb });
    });
    matches.sort(function (a, b) { return a.d - b.d; });

    // locate player rows (exact, else first-name match)
    function samePlayer(a, b) {
      a = a.toLowerCase(); b = b.toLowerCase();
      return a === b || a.split(' ')[0] === b.split(' ')[0];
    }
    var mine = matches.filter(function (m) {
      return m.teamA.concat(m.teamB).some(function (n) { return samePlayer(n, who); });
    });
    if (!who) { root.innerHTML = '<div class="lb-loading">No player specified.</div>'; return; }
    if (!mine.length) {
      root.innerHTML = '<div class="lb-loading">No recorded games found for <b>' + who + '</b>. <a href="monday-ladder.html#ladder">Back to leaderboard</a></div>';
      return;
    }

    // --- stats ---
    var st = { p: 0, w: 0, l: 0, wm: 0, lm: 0, c: [0, 0, 0, 0], pf: 0, pa: 0 };
    var partners = {}, opponents = {}, form = [], byMonth = {}, seasons = {};
    var maxpAll = 0;
    var counts = {};
    matches.forEach(function (m) { m.teamA.concat(m.teamB).forEach(function (n) { counts[n] = (counts[n] || 0) + 1; }); });
    for (var n in counts) if (!/dummy/i.test(n)) maxpAll = Math.max(maxpAll, counts[n]);

    function seasonOf(d) {
      var y = d.getFullYear(), m = d.getMonth();
      var start = (m >= 8) ? y : y - 1; // Sept start
      return { label: 'Sep ' + start + '–Aug ' + (start + 1), key: start };
    }

    mine.forEach(function (m) {
      var inA = m.teamA.some(function (n) { return samePlayer(n, who); });
      var team = inA ? m.teamA : m.teamB, opp = inA ? m.teamB : m.teamA;
      var won = inA ? m.aWin : !m.aWin;
      var diff = m.sa - m.sb; if (!inA) diff = -diff;
      var pf = inA ? m.sa : m.sb;
      st.p++; if (m.court >= 1 && m.court <= 4) st.c[m.court - 1]++;
      st.pf += pf; st.pa += (inA ? m.sb : m.sa);
      if (won) { st.w++; st.wm += diff; } else { st.l++; st.lm += diff; }
      form.push(won ? 'W' : 'L');
      var mk = m.d.getFullYear() + '-' + ('0' + (m.d.getMonth() + 1)).slice(-2);
      var mm = byMonth[mk] = byMonth[mk] || { p: 0, w: 0 };
      mm.p++; if (won) mm.w++;
      var sKey = seasonOf(m.d).key;
      var s = seasons[sKey] = seasons[sKey] || { label: seasonOf(m.d).label, p: 0, w: 0, l: 0, wm: 0, lm: 0, c: [0, 0, 0, 0] };
      s.p++; if (won) { s.w++; s.wm += diff; } else { s.l++; s.lm += diff; }
      if (m.court >= 1 && m.court <= 4) s.c[m.court - 1]++;
      team.forEach(function (n) { if (!samePlayer(n, who) && !/dummy/i.test(n)) { var o = partners[n] = partners[n] || { p: 0, w: 0 }; o.p++; if (won) o.w++; } });
      opp.forEach(function (n) { if (!/dummy/i.test(n)) { var o = opponents[n] = opponents[n] || { p: 0, w: 0 }; o.p++; if (won) o.w++; } });
    });

    // max played within each season + overall for the regular threshold
    var allP = matches.filter(function (m2) { return true; });
    function seasonMax(key) {
      var mx = 0, cnt = {};
      matches.forEach(function (m) {
        if (seasonOf(m.d).key !== key) return;
        m.teamA.concat(m.teamB).forEach(function (n) { if (!/dummy/i.test(n)) cnt[n] = (cnt[n] || 0) + 1; });
      });
      for (var n in cnt) mx = Math.max(mx, cnt[n]);
      return mx || 1;
    }
    function scoreOf(o, maxp) {
      var wr = (o.w / o.p) * (o.p > maxp * 0.3 ? 50 : 30);
      var vs = Math.log10(o.p) * 10;
      var ms = ((o.wm + o.lm) / o.p) * 2;
      var cs = (o.c[0] * 25 + o.c[1] * 15 + o.c[2] * 10 + o.c[3] * 5) / o.p;
      return { wr: wr, vs: vs, ms: ms, cs: cs, total: wr + vs + ms + cs };
    }
    var score = scoreOf(st, maxpAll);

    // rank among all players (all-time)
    var allStats = {};
    matches.forEach(function (m) {
      var diff = m.sa - m.sb;
      function bump(n, won, dm, court) {
        if (!n || /dummy/i.test(n)) return;
        var o = allStats[n] = allStats[n] || { p: 0, w: 0, wm: 0, lm: 0, c: [0, 0, 0, 0] };
        o.p++; if (court >= 1 && court <= 4) o.c[court - 1]++;
        if (won) { o.w++; o.wm += dm; } else o.lm += dm; // dm is signed margin for this player (negative on a loss)
      }
      m.teamA.forEach(function (n) { bump(n, m.aWin, diff, m.court); });
      m.teamB.forEach(function (n) { bump(n, !m.aWin, -diff, m.court); });
    });
    for (var k in allStats) { var o2 = allStats[k]; o2.score = scoreOf(o2, maxpAll).total; }
    var myRank = 1, totalPlayers = 0;
    for (var k2 in allStats) { totalPlayers++; if (allStats[k2].score > score.total) myRank++; }

    // --- render ---
    var name = displayName(who);
    var winRate = Math.round(100 * st.w / st.p);
    var avg = (st.pf / st.p).toFixed(1) + '–' + (st.pa / st.p).toFixed(1);
    var first = mine[0].d, last = mine[mine.length - 1].d;
    function fd(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

    var h = '<section class="section tight"><a class="back-link" href="monday-ladder.html#ladder">← Back to leaderboard</a>' +
      '<div class="pcard">' +
      '<img class="pavatar" src="' + photoFor(who) + '" alt="' + name + '" onerror="this.src=\'https://ui-avatars.com/api/?background=b6e63e&color=060f24&size=160&format=svg&bold=true&name=' + encodeURIComponent(name) + '\'">' +
      '<div class="pinfo"><span class="tag">🏸 Sutton Shuttlers · League player</span>' +
      '<h2>' + name + '</h2>' +
      '<div class="pbadges"><span class="pbadge">#' + myRank + ' of ' + totalPlayers + ' all-time</span>' +
      '<span class="pbadge">Playing since ' + fd(first) + '</span></div>' +
      '<div class="psub">Last played ' + fd(last) + '</div>' +
      '<div class="phero-stats">' +
      pstat(st.p, 'Matches') + pstat(st.w + '–' + st.l, 'W–L') + pstat(winRate + '%', 'Win rate') +
      pstat(avg, 'Avg score') + pstat(score.total.toFixed(1), 'Rank score') + pstat('+' + st.wm, 'Win margin') +
      '</div></div></div>';

    // rank score breakdown bars
    var pieces = [['Win rate', score.wr], ['Volume', score.vs], ['Margin', score.ms], ['Court', score.cs]];
    var mx = Math.max.apply(null, pieces.map(function (x) { return Math.abs(x[1]); }).concat([1]));
    h += '<div class="card pblock"><h3>🏸 Rank score breakdown</h3>';
    pieces.forEach(function (x) {
      var pct = Math.round(100 * Math.abs(x[1]) / Math.max(mx, 20));
      h += '<div class="pbar-row"><span>' + x[0] + '</span><div class="pbar"><i style="width:' + pct + '%"></i></div><b>' + x[1].toFixed(1) + '</b></div>';
    });
    h += '<div class="pbar-row total"><span>Total</span><div class="pbar"><i style="width:100%"></i></div><b>' + score.total.toFixed(1) + '</b></div>';
    h += '<div class="chart-expl">RankScore (the club\'s official ranking formula) = WinRateScore + VolumeScore + MarginScore + CourtScore. Win rate rewards consistency, volume rewards turning up, margin rewards winning big, court rewards playing on the higher courts (Court 1 counts most).</div></div>';

    // recent form — full-width strip of all games, latest first
    var motiv;
    if (!st.p) motiv = '';
    else if (st.w === st.p) motiv = 'Flawless — every single game a win. Unreal! 🏸🔥';
    else if (winRate >= 66) motiv = 'Outstanding — you win about 2 of every 3 games! 🔥';
    else if (winRate >= 50) motiv = 'You win more than half your games — keep the pressure on! 💪';
    else if (winRate >= 33) motiv = 'Roughly every third game is yours — momentum is building, keep going! 🏸';
    else if (st.w > 0) motiv = 'Every game on court makes you sharper — the wins are coming! 🏸';
    else motiv = 'Tough run — but showing up is the first step. Your first win is close! 🏸';
    h += '<div class="card pblock"><h3>🏸 Recent form <span class="hsub">(latest on the left)</span></h3><div class="motiv">' + motiv + '</div><div class="form-strip wide">';
    form.slice().reverse().forEach(function (r) { h += '<span class="fchip ' + (r === 'W' ? 'fw' : 'fl') + '">' + r + '</span>'; });
    h += '</div><div class="psub">All ' + form.length + ' games, newest first — scroll sideways</div></div>';

    // by court, per season
    h += '<div class="card pblock"><h3>🏸 Games by court — per season</h3><div class="lb-wrap"><table class="lb-table mini"><tr><th>Season</th><th>Court 1</th><th>Court 2</th><th>Court 3</th><th>Court 4</th></tr>';
    var sKeysAll = Object.keys(seasons).map(Number).sort().reverse();
    sKeysAll.forEach(function (k) {
      var s = seasons[k];
      h += '<tr><td>' + s.label + '</td><td>' + s.c[0] + '</td><td>' + s.c[1] + '</td><td>' + s.c[2] + '</td><td>' + s.c[3] + '</td></tr>';
    });
    h += '<tr class="cs-total"><td><b>All time</b></td><td><b>' + st.c[0] + '</b></td><td><b>' + st.c[1] + '</b></td><td><b>' + st.c[2] + '</b></td><td><b>' + st.c[3] + '</b></td></tr>';
    h += '</table></div><div class="chart-expl">Court 1 is the top court — more games there means a stronger ladder position that night.</div></div>';

    // activity chart (games per month, CSS bars with counts)
    var mks = Object.keys(byMonth).sort();
    var mmax = Math.max.apply(null, mks.map(function (k) { return byMonth[k].p; }));
    h += '<div class="card pblock"><h3>🏸 Activity — games per month <span class="hsub">(green = wins, grey = losses)</span></h3><div class="pchart">';
    mks.forEach(function (k) {
      var gp = byMonth[k].p, gw = byMonth[k].w, gl = gp - gw;
      var pc = Math.round(100 * gp / mmax);
      var lp = Math.round(100 * gl / gp), wp = 100 - lp;
      h += '<div class="pcol" title="' + k + ': ' + gp + ' games (' + gw + 'W-' + gl + 'L)"><em>' + gp + '</em><i class="wl" style="height:' + Math.max(4, pc) + '%">' +
        (gl ? '<b class="seg l" style="height:' + lp + '%">' + (gl >= 2 ? gl : '') + '</b>' : '') +
        '<b class="seg w" style="height:' + (gl ? wp : 100) + '%">' + (gw >= 2 ? gw : '') + '</b></i><span>' + k.slice(5) + '/' + k.slice(2, 4) + '</span></div>';
    });
    h += '</div></div>';

    // season table
    var sKeys = sKeysAll;
    h += '<div class="card pblock"><h3>🏸 Season by season</h3><div class="lb-wrap"><table class="lb-table"><tr><th>Season</th><th>P</th><th>W</th><th>L</th><th>Win %</th><th>Score</th></tr>';
    sKeys.forEach(function (k) {
      var s = seasons[k], sc = scoreOf(s, seasonMax(k));
      h += '<tr><td>' + s.label + '</td><td>' + s.p + '</td><td>' + s.w + '</td><td>' + s.l + '</td><td>' +
        Math.round(100 * s.w / s.p) + '%</td><td><b>' + sc.total.toFixed(1) + '</b></td></tr>';
    });
    h += '</table></div><div class="chart-expl">Each season\'s Score uses the same RankScore formula (win rate + volume + margin + court strength) but computed only over that season\'s games — so it can be compared with the season tab on the leaderboard.</div></div>';

    // partnerships + rivalries — ordered by win %, min 3 games
    function topOf(map) {
      return Object.keys(map).map(function (n) { var o = map[n]; return { n: n, p: o.p, w: o.w, wr: o.w / o.p }; })
        .filter(function (o) { return o.p >= 3; })
        .sort(function (a, b) { return b.wr - a.wr || b.p - a.p; }).slice(0, 5);
    }
    var tp = topOf(partners), fo = topOf(opponents);
    // pairing insights
    var bestPartner = tp[0];
    var favPartner = Object.keys(partners).map(function (n) { return { n: n, p: partners[n].p, w: partners[n].w }; }).sort(function (a, b) { return b.p - a.p; })[0];
    var rival = Object.keys(opponents).map(function (n) { var o = opponents[n]; return { n: n, p: o.p, w: o.w, wr: o.w / o.p }; }).filter(function (o) { return o.p >= 3; }).sort(function (a, b) { return a.wr - b.wr || b.p - a.p; })[0];
    var bogey = Object.keys(opponents).map(function (n) { var o = opponents[n]; return { n: n, p: o.p, w: o.w, wr: o.w / o.p }; }).filter(function (o) { return o.p >= 3; }).sort(function (a, b) { return b.wr - a.wr || b.p - a.p; })[0];
    h += '<div class="insight">';
    if (bestPartner) h += '🏸 <b>Best pairing:</b> with <b>' + bestPartner.n + '</b> — ' + Math.round(100 * bestPartner.wr) + '% wins across ' + bestPartner.p + ' games together. ';
    if (favPartner && (!bestPartner || favPartner.n !== bestPartner.n)) h += '<b>Most frequent partner:</b> ' + favPartner.n + ' (' + favPartner.p + ' games). ';
    if (rival) h += '<b>Toughest opponent:</b> ' + rival.n + ' — ' + name + ' wins only ' + Math.round(100 * rival.wr) + '% of their meetings. ';
    if (bogey && (!rival || bogey.n !== rival.n)) h += '<b>Favourite opponent:</b> ' + bogey.n + ' — ' + Math.round(100 * bogey.wr) + '% wins against them.';
    h += '</div>';
    h += '<div class="pgrid">';
    h += '<div class="card pblock"><h3>🏸 Top partners <span class="hsub">(by win %)</span></h3><table class="lb-table mini"><tr><th>Partner</th><th>Games</th><th>Wins</th><th>Win %</th></tr>';
    if (!tp.length) h += '<tr><td colspan="4">Not enough games yet</td></tr>';
    tp.forEach(function (o) { h += '<tr><td>' + o.n + '</td><td>' + o.p + '</td><td>' + o.w + '</td><td>' + Math.round(100 * o.wr) + '%</td></tr>'; });
    h += '</table></div>';
    h += '<div class="card pblock"><h3>🏸 Toughest opponents <span class="hsub">(by their win % vs ' + name + ')</span></h3><table class="lb-table mini"><tr><th>Opponent</th><th>Games</th><th>Wins vs</th><th>Win %</th></tr>';
    var foes = Object.keys(opponents).map(function (n) { var o = opponents[n]; return { n: n, p: o.p, w: o.w, wr: o.w / o.p }; })
      .filter(function (o) { return o.p >= 3; }).sort(function (a, b) { return a.wr - b.wr || b.p - a.p; }).slice(0, 5);
    if (!foes.length) h += '<tr><td colspan="4">Not enough games yet</td></tr>';
    foes.forEach(function (o) { h += '<tr><td>' + o.n + '</td><td>' + o.p + '</td><td>' + o.w + '</td><td>' + Math.round(100 * o.wr) + '%</td></tr>'; });
    h += '</table></div></div>';

    h += '<div class="lb-note">Stats are live from the club score sheet — they update as soon as new scores are entered.</div></section>';
    root.innerHTML = h;
    document.title = name + ' | Sutton Shuttlers Badminton Club';
  }

  function stat(v,l){return pstat(v,l)} function pstat(v, l) { return '<div class="pstat"><b>' + v + '</b><span>' + l + '</span></div>'; }
})();
