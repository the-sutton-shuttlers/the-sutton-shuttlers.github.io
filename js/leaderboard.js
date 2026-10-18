// Live leaderboard — reads the club's public Monday Ladder sheet (gviz JSON,
// loaded via a script tag because the endpoint doesn't send CORS headers).
(function () {
  var SHEET_ID = '1iwTDGnrZS69bOU5AdxDGS2q_tFVCgi6I5M5v6arG8hs';
  var TAB = '4. Score Table';
  var root = document.getElementById('leaderboard');
  if (!root) return;

  root.innerHTML = '<div class="lb-loading">Loading live leaderboard…</div>';

  function loadTab(tab, cb) {
    var g = window.google = window.google || {};
    g.visualization = g.visualization || {};
    g.visualization.Query = g.visualization.Query || {};
    g.visualization.Query.setResponse = cb;
    var s = document.createElement('script');
    s.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(tab);
    s.onerror = function () { cb(null); };
    document.head.appendChild(s);
  }
  function loadSheet(cb) { loadTab(TAB, cb); }

  // Photo + full-name map from the Ranking_ALL tab (cols 21 name, 22 photo link)
  var photos = {}, fullNames = {};
  function photoFor(name) {
    var k = (name || '').toLowerCase();
    if (photos[k]) return photos[k];
    var first = k.split(' ')[0];
    for (var key in photos) if (key.split(' ')[0] === first) return photos[key];
    return 'https://ui-avatars.com/api/?background=b6e63e&color=060f24&size=100&format=svg&bold=true&name=' + encodeURIComponent(name || '');
  }
  function displayName(name) {
    var k = (name || '').toLowerCase();
    if (fullNames[k]) return fullNames[k];
    var first = k.split(' ')[0];
    for (var key in fullNames) if (key.split(' ')[0] === first) return fullNames[key];
    return name;
  }
  function loadPhotos(cb) {
    loadTab('Ranking_ALL', function (res) {
      if (res && res.table) {
        res.table.rows.forEach(function (rw) {
          var c = rw.c || [];
          var n = (c[21] && c[21].v || '').toString().trim();
          var link = (c[22] && c[22].v || '').toString().trim();
          if (!n || !link) return;
          photos[n.toLowerCase()] = link;
          var m = link.match(/[?&]name=([^&]+)/);
          if (m) fullNames[n.toLowerCase()] = decodeURIComponent(m[1].replace(/\+/g, ' '));
        });
      }
      cb();
    });
  }

  var MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  function parseDate(f) {
    var m = String(f || '').match(/(\d{1,2})-([A-Za-z]+)-(\d{2,4})/);
    if (!m) return null;
    var y = +m[3]; if (y < 100) y += 2000;
    return new Date(y, MONTHS[m[2].toLowerCase()], +m[1]);
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmt(d) { return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }

  loadSheet(function (res) {
    if (!res || !res.table) {
      root.innerHTML = '<div class="lb-loading">Couldn’t load live scores right now — please check back later.</div>';
      return;
    }
    var rows = res.table.rows, matches = [], lastDate = null, seen = {};
    rows.forEach(function (r) {
      var c = r.c;
      function v(i) { return c[i] && c[i].v != null ? c[i].v : ''; }
      function f(i) { return c[i] && c[i].f != null ? c[i].f : v(i); }
      var d = parseDate(f(0));
      if (!d) return;
      var key = f(0) + '|' + v(1) + '|' + v(2);
      if (seen[key]) return; seen[key] = 1;
      var sa = +v(7), sb = +v(8), pa = String(v(9)), pb = String(v(10));
      var teamA = [v(3), v(4)], teamB = [v(5), v(6)];
      var aWin = null;
      if (pa === '10' || pa === 10) aWin = true;
      else if (pb === '10' || pb === 10) aWin = false;
      else if (!isNaN(sa) && !isNaN(sb) && sa !== sb) aWin = sa > sb;
      if (aWin === null) return;
      matches.push({ d: d, court: +v(1) || 0, teamA: teamA, teamB: teamB, aWin: aWin, sa: sa, sb: sb });
      if (!lastDate || d > lastDate) lastDate = d;
    });
    if (!matches.length) {
      root.innerHTML = '<div class="lb-loading">No score data found yet.</div>';
      return;
    }

    // Build season list (Sep–Aug) covering the data range + next season slot
    var minY = matches[0].d.getFullYear(), maxD = lastDate;
    matches.forEach(function (m) { if (m.d.getFullYear() < minY) minY = m.d.getFullYear(); });
    var startY = minY;
    if (matches[0].d.getMonth() < 8) startY = minY - 1; // Jan-Aug belongs to season started prev Sep
    var endSeasonY = maxD.getMonth() >= 8 ? maxD.getFullYear() : maxD.getFullYear() - 1;
    var seasons = [];
    for (var y = startY; y <= endSeasonY; y++) {
      seasons.push({ label: 'Sep ' + y + ' – Aug ' + (y + 1), from: new Date(y, 8, 1), to: new Date(y + 1, 8, 1) });
    }
    var tabs = [{ label: 'All time', all: true }].concat(seasons);
    var curIdx = tabs.length - 1; // default: most recent season

    function seasonKey(d) { var y = d.getFullYear(), mo = d.getMonth(); return (mo >= 8) ? y : y - 1; }

    // --- club-level stats ---
    function buildStats() {
      var csRoot = document.getElementById('club-stats-body');
      if (!csRoot) return;
      var dates = {}, players = {}, bySeason = {}, byMonth = {}, monthPlayers = {};
      matches.forEach(function (m) {
        dates[m.d.toDateString()] = 1;
        var k = seasonKey(m.d);
        var s = bySeason[k] = bySeason[k] || { games: 0, dates: {}, players: {}, counts: {} };
        s.games++; s.dates[m.d.toDateString()] = 1;
        var mk = m.d.getFullYear() + '-' + ('0' + (m.d.getMonth() + 1)).slice(-2);
        byMonth[mk] = (byMonth[mk] || 0) + 1;
        var mp = monthPlayers[mk] = monthPlayers[mk] || {};
        m.teamA.concat(m.teamB).forEach(function (n) {
          if (n && !/dummy|^player \d$/i.test(n)) { players[n] = 1; s.players[n] = 1; mp[n] = 1; s.counts[n] = (s.counts[n] || 0) + 1; }
        });
      });
      var nSessions = Object.keys(dates).length;
      var nPlayers = Object.keys(players).length;
      var h = '<div class="pstats">' +
        '<div class="pstat"><b>' + matches.length + '</b><span>Games played</span></div>' +
        '<div class="pstat"><b>' + nSessions + '</b><span>Ladder nights</span></div>' +
        '<div class="pstat"><b>' + nPlayers + '</b><span>Players</span></div>' +
        '<div class="pstat"><b>' + Math.round(matches.length / Math.max(nSessions, 1)) + '</b><span>Games / night</span></div>' +
        '<div class="pstat"><b>' + seasons.length + '</b><span>Seasons</span></div>' +
        '</div>';
      // per-season table
      h += '<div class="lb-wrap"><table class="lb-table"><tr><th>Season</th><th>Nights</th><th>Games</th><th>Players</th><th>Games/night</th></tr>';
      Object.keys(bySeason).sort().forEach(function (k) {
        var s = bySeason[k], n = Object.keys(s.dates).length;
        h += '<tr><td>Sep ' + k + ' – Aug ' + (+k + 1) + '</td><td>' + n + '</td><td>' + s.games +
          '</td><td>' + Object.keys(s.players).length + '</td><td>' + Math.round(s.games / Math.max(n, 1)) + '</td></tr>';
      });
      h += '<tr class="cs-total"><td><b>All time</b></td><td><b>' + nSessions + '</b></td><td><b>' + matches.length +
        '</b></td><td><b>' + nPlayers + '</b></td><td><b>' + Math.round(matches.length / Math.max(nSessions, 1)) + '</b></td></tr>';
      h += '</table></div>';
      // most-committed player per season — showing up is the win
      h += '<div class="ironman"><h4>🏸 Iron Man Award — most games played each season</h4><div class="im-grid">';
      Object.keys(bySeason).sort().forEach(function (k) {
        var s = bySeason[k], best = null, bestN = 0;
        Object.keys(s.counts).forEach(function (n) { if (s.counts[n] > bestN) { bestN = s.counts[n]; best = n; } });
        if (!best) return;
        h += '<a class="im-card" href="player.html?n=' + encodeURIComponent(best) + '">' +
          '<img class="im-photo" src="' + photoFor(best) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
          '<div><span class="im-season">Sep ' + k + ' – Aug ' + (+k + 1) + '</span>' +
          '<b>' + displayName(best) + '</b><span class="im-games">' + bestN + ' games played</span></div></a>';
      });
      h += '</div><div class="chart-expl">Turning up counts more than winning — these players showed up the most.</div></div>';
      // activity chart — games per month
      var mks = Object.keys(byMonth).sort();
      var mmax = Math.max.apply(null, mks.map(function (k) { return byMonth[k]; }));
      h += '<div class="card pblock"><h3>Club activity — per month</h3>' +
        '<div class="chart-legend"><span><i class="lg lime"></i>Games played that month</span><span><i class="lg teal"></i>Different players who turned up</span></div>' +
        '<div class="pchart dual">';
      var pmax = Math.max.apply(null, mks.map(function (k) { return Object.keys(monthPlayers[k] || {}).length; }));
      mks.forEach(function (k) {
        var pc = Math.round(100 * byMonth[k] / mmax);
        var np = Object.keys(monthPlayers[k] || {}).length;
        var pp = Math.round(100 * np / pmax);
        h += '<div class="pcol" title="' + k + ': ' + byMonth[k] + ' games · ' + np + ' players">' +
          '<i class="b1" style="height:' + Math.max(4, pc) + '%"></i><i class="b2" style="height:' + Math.max(4, pp) + '%"></i>' +
          '<span>' + k.slice(5) + '/' + k.slice(2, 4) + '</span></div>';
      });
      h += '</div><div class="chart-expl">Each month shows two bars side by side: <b style="color:#b6e63e">lime</b> = total games played across all courts, <b style="color:#f59e0b">amber</b> = how many different players appeared that month. Hover a column for exact numbers.</div></div>';
      csRoot.innerHTML = h;
    }

    function buildPlayers() {
      var pgRoot = document.getElementById('players-grid');
      if (!pgRoot) return;
      var all = standing(tabs[0]);
      var h = '<div class="players">';
      all.forEach(function (s, i) {
        h += '<a class="player ranked" href="player.html?n=' + encodeURIComponent(s.n) + '">' +
          '<span class="prank">' + (i + 1) + '</span>' +
          '<img class="pthumb" src="' + photoFor(s.n) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
          '<div><b>' + displayName(s.n) + '</b><small>' + s.p + ' games · ' + s.w + ' wins · ' + Math.round(100 * s.winRate) + '%</small></div></a>';
      });
      pgRoot.innerHTML = h + '</div>';
    }

    // Club ranking model (same as the 'ranking' tab):
    //   WinRateScore = winRate × (50 if played > 30% of max, else 30)
    //   VolumeScore  = log10(played) × 10
    //   MarginScore  = (wonMargin + lostMargin) / played × 2
    //   CourtScore   = (C1×25 + C2×15 + C3×10 + C4×5) / played
    //   RankScore    = sum of the four
    function standing(season) {
      var p = {};
      function bump(name, court, won, margin) {
        if (!name || /dummy/i.test(name)) return;
        var o = p[name] = p[name] || { n: name, p: 0, w: 0, l: 0, wm: 0, lm: 0, c: [0, 0, 0, 0] };
        o.p++;
        if (court >= 1 && court <= 4) o.c[court - 1]++;
        if (won) { o.w++; o.wm += margin; } else { o.l++; o.lm += margin; }
      }
      matches.forEach(function (m) {
        if (!season.all && (m.d < season.from || m.d >= season.to)) return;
        var diff = m.sa - m.sb;
        m.teamA.forEach(function (n) { bump(n, m.court, m.aWin, diff); });
        m.teamB.forEach(function (n) { bump(n, m.court, !m.aWin, -diff); });
      });
      var arr = Object.keys(p).map(function (k) { return p[k]; });
      var maxp = Math.max.apply(null, arr.map(function (o) { return o.p; }).concat([1]));
      arr.forEach(function (o) {
        o.winRate = o.w / o.p;
        o.wr = o.winRate * (o.p > maxp * 0.3 ? 50 : 30);
        o.vs = Math.log10(o.p) * 10;
        o.ms = ((o.wm + o.lm) / o.p) * 2;
        o.cs = (o.c[0] * 25 + o.c[1] * 15 + o.c[2] * 10 + o.c[3] * 5) / o.p;
        o.score = o.wr + o.vs + o.ms + o.cs;
      });
      arr.sort(function (a, b) {
        return b.score - a.score || b.winRate - a.winRate || b.p - a.p || a.n.localeCompare(b.n);
      });
      return arr;
    }

    function render(idx) {
      var season = tabs[idx];
      var st = standing(season);
      var maxGames = st.length ? Math.max.apply(null, st.map(function (s) { return s.p; })) : 0;
      var h = '<p class="lb-tag">Every point counts. Every Monday matters.</p>' +
        '<p class="lb-desc">Ranked on the club\'s RankScore — a blend of win rate, games played, winning margin and court strength (Court 1 counts most).</p>' +
        '<div class="lb-tabs">';
      tabs.forEach(function (t, i) {
        h += '<button class="lb-tab' + (i === idx ? ' on' : '') + '" data-i="' + i + '">' + t.label + '</button>';
      });
      h += '</div>';
      h += '<div class="lb-meta">' + st.length + ' players ranked · updated ' + fmt(lastDate) + '</div>';

      if (st.length) {
        var top3 = st.slice(0, 3);
        h += '<div class="podium">';
        var order = [1, 0, 2], medals = ['gold', 'silver', 'bronze'], gongs = ['🥇', '🥈', '🥉'];
        order.forEach(function (pos) {
          var s = top3[pos]; if (!s) return;
          h += '<a class="pod ' + medals[pos] + '" href="player.html?n=' + encodeURIComponent(s.n) + '">' +
            '<div class="pod-medal">' + gongs[pos] + '</div>' +
            '<img class="pod-photo" src="' + photoFor(s.n) + '" alt="' + displayName(s.n) + '" onerror="this.style.display=\'none\'">' +
            '<div class="pod-rank">' + (pos + 1) + '</div>' +
            '<div class="pod-name">' + displayName(s.n) + '</div><div class="pod-pts">' + s.score.toFixed(1) + '</div>' +
            '<div class="pod-sub">' + s.w + 'W · ' + Math.round(100 * s.winRate) + '%</div></a>';
        });
        h += '</div>';

        h += '<div class="lb-wrap lb-scroll"><table class="lb-table"><tr><th>#</th><th>Player</th><th>P</th><th>W</th><th>L</th><th>Win %</th><th>Score</th></tr>';
        st.forEach(function (s, i) {
          var cls = i < 3 ? ' class="top' + (i + 1) + '"' : '';
          h += '<tr' + cls + '><td>' + (i + 1) + '</td><td><a class="lb-link" href="player.html?n=' + encodeURIComponent(s.n) + '">' + displayName(s.n) + '</a></td><td>' + s.p + '</td><td>' + s.w +
            '</td><td>' + s.l + '</td><td>' + Math.round(100 * s.winRate) + '%</td><td><b>' + s.score.toFixed(1) + '</b></td></tr>';
        });
        h += '</table></div>';
        h += '<div class="lb-note">Rank = win-rate, volume, win margin &amp; court strength — same formula as the club sheet · ' + season.label + (season.all ? '' : ' season') + '</div>';
      } else {
        h += '<div class="lb-loading">No games recorded in this season yet.</div>';
      }
      root.innerHTML = h;
      root.querySelectorAll('.lb-tab').forEach(function (b) {
        b.addEventListener('click', function () { render(+b.dataset.i); });
      });
    }
    loadPhotos(function () {
      buildStats();
      buildPlayers();
      render(curIdx);
    });
  });
})();
