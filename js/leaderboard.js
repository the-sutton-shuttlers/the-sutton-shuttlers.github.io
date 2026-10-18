// Live leaderboard — reads the club's public Monday Ladder sheet (gviz JSON,
// loaded via a script tag because the endpoint doesn't send CORS headers).
(function () {
  var SHEET_ID = '1iwTDGnrZS69bOU5AdxDGS2q_tFVCgi6I5M5v6arG8hs';
  var TAB = '4. Score Table';
  var root = document.getElementById('leaderboard');
  if (!root) return;

  root.innerHTML = '<div class="lb-loading">Loading live leaderboard…</div>';

  function loadSheet(cb) {
    var g = window.google = window.google || {};
    g.visualization = g.visualization || {};
    g.visualization.Query = g.visualization.Query || {};
    g.visualization.Query.setResponse = cb;
    var s = document.createElement('script');
    s.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(TAB);
    s.onerror = function () { cb(null); };
    document.head.appendChild(s);
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

    // --- club-level stats ---
    (function () {
      var csRoot = document.getElementById('club-stats-body');
      if (csRoot) {
        var dates = {}, players = {}, seasonCounts = {};
        matches.forEach(function (m) {
          dates[m.d.toDateString()] = 1;
          m.teamA.concat(m.teamB).forEach(function (n) {
            if (n && !/dummy|^player \d$/i.test(n)) players[n] = 1;
          });
          var y = m.d.getFullYear(), mo = m.d.getMonth();
          var sk = (mo >= 8) ? y : y - 1;
          seasonCounts[sk] = (seasonCounts[sk] || 0) + 1;
        });
        var nSessions = Object.keys(dates).length;
        var nPlayers = Object.keys(players).length;
        var first = lastDate, last = lastDate;
        matches.forEach(function (m) { if (m.d < first) first = m.d; });
        var fd = function (d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
        var h = '<div class="pstats">' +
          '<div class="pstat"><b>' + matches.length + '</b><span>Games played</span></div>' +
          '<div class="pstat"><b>' + nSessions + '</b><span>Monday nights</span></div>' +
          '<div class="pstat"><b>' + nPlayers + '</b><span>Players</span></div>' +
          '<div class="pstat"><b>' + (matches.length / Math.max(nSessions, 1)).toFixed(1) + '</b><span>Games / night</span></div>' +
          '<div class="pstat"><b>' + seasons.length + '</b><span>Seasons</span></div>' +
          '<div class="pstat"><b>' + fd(first) + '</b><span>First game</span></div>' +
          '</div>' +
          '<div class="cs-seasons">' +
          Object.keys(seasonCounts).sort().map(function (k) {
            return '<span class="pbadge">Sep ' + k + '–Aug ' + (+k + 1) + ': <b>' + seasonCounts[k] + '</b> games</span>';
          }).join('') + '</div>' +
          '<div class="psub" style="margin-top:8px">Latest scores: ' + fd(last) + '</div>';
        csRoot.innerHTML = h;
      }
      var pgRoot = document.getElementById('players-grid');
      if (pgRoot) {
        var all = standing(tabs[0]);
        var h2 = '<div class="players">';
        all.forEach(function (s, i) {
          h2 += '<a class="player ranked" href="player.html?n=' + encodeURIComponent(s.n) + '">' +
            '<span class="prank">' + (i + 1) + '</span>' +
            '<div><b>' + s.n + '</b><small>' + s.p + ' games · ' + Math.round(100 * s.winRate) + '% win</small></div></a>';
        });
        pgRoot.innerHTML = h2 + '</div>';
      }
    })();

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
      var h = '<div class="lb-tabs">';
      tabs.forEach(function (t, i) {
        h += '<button class="lb-tab' + (i === idx ? ' on' : '') + '" data-i="' + i + '">' + t.label + '</button>';
      });
      h += '</div>';
      h += '<div class="lb-meta">' + st.length + ' players ranked · updated ' + fmt(lastDate) + '</div>';

      if (st.length) {
        var top3 = st.slice(0, 3);
        h += '<div class="podium">';
        var order = [1, 0, 2], medals = ['gold', 'silver', 'bronze'];
        order.forEach(function (pos) {
          var s = top3[pos]; if (!s) return;
          h += '<div class="pod ' + medals[pos] + '"><div class="pod-rank">' + (pos + 1) + '</div>' +
            '<div class="pod-name"><a class="lb-link" href="player.html?n=' + encodeURIComponent(s.n) + '">' + s.n + '</a></div><div class="pod-pts">' + s.score.toFixed(1) + '</div>' +
            '<div class="pod-sub">' + s.w + 'W · ' + Math.round(100 * s.winRate) + '%</div></div>';
        });
        h += '</div>';

        h += '<div class="lb-wrap"><table class="lb-table"><tr><th>#</th><th>Player</th><th>P</th><th>W</th><th>L</th><th>Win %</th><th>Score</th></tr>';
        st.forEach(function (s, i) {
          var cls = i < 3 ? ' class="top' + (i + 1) + '"' : '';
          h += '<tr' + cls + '><td>' + (i + 1) + '</td><td><a class="lb-link" href="player.html?n=' + encodeURIComponent(s.n) + '">' + s.n + '</a></td><td>' + s.p + '</td><td>' + s.w +
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
    render(curIdx);
  });
})();
