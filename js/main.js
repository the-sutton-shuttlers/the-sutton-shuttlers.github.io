// Mobile nav
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    const closeMenu = () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      toggle.innerHTML = '&#9776;';
    };
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') !== 'true';
      links.classList.toggle('open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
      toggle.innerHTML = isOpen ? '&times;' : '&#9776;';
    });
    links.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        closeMenu();
        toggle.focus();
      }
    });
  }

  // Lightbox slideshow
  const lb = document.querySelector('.lightbox');
  if (lb) {
    const lbImg = lb.querySelector('img');
    const lbCount = lb.querySelector('.lb-count');
    const prev = lb.querySelector('.lb-prev');
    const next = lb.querySelector('.lb-next');
    let pics = [], idx = 0;
    const show = i => {
      idx = (i + pics.length) % pics.length;
      lbImg.src = pics[idx].src;
      if (lbCount) lbCount.textContent = (idx + 1) + ' / ' + pics.length;
    };
    document.querySelectorAll('.gallery img').forEach((img, i) => {
      img.addEventListener('click', () => {
        pics = Array.from(img.closest('.gallery').querySelectorAll('img'));
        show(pics.indexOf(img));
        lb.classList.add('open');
      });
    });
    const go = d => { if (pics.length) show(idx + d); };
    if (prev) prev.addEventListener('click', e => { e.stopPropagation(); go(-1); });
    if (next) next.addEventListener('click', e => { e.stopPropagation(); go(1); });
    lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('close')) lb.classList.remove('open'); });
    lbImg.addEventListener('click', e => { e.stopPropagation(); go(1); });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    });
    let tx = null;
    lb.addEventListener('touchstart', e => tx = e.touches[0].clientX, { passive: true });
    lb.addEventListener('touchend', e => {
      if (tx === null) return;
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      tx = null;
    }, { passive: true });
  }

  // AJAX form submit (FormSubmit email + optional Google Apps Script sheet webhook)
  document.querySelectorAll('form[data-formsubmit]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const status = form.querySelector('.form-status');

      // Party form validation runs here, before any network call — a separate
      // submit listener can't stop this handler once it has started.
      if (form.dataset.gform) {
        const labels = { adults: 'Adults', kids: 'Children 5-11', u5: 'Children under 5' };
        let bad = null, total = 0;
        Object.keys(labels).forEach(g => {
          const gn = +form.querySelector('#' + g).value || 0;
          const vn = +form.querySelector('#' + g + '-veg').value || 0;
          total += gn;
          if (vn > gn) bad = labels[g];
        });
        if (bad || total < 1) {
          status.className = 'form-status err';
          status.textContent = bad
            ? bad + ': the vegetarian count is more than the total guests — please correct the numbers.'
            : 'Please add at least one guest.';
          return;
        }
      }

      const email = form.dataset.formsubmit;
      const data = new FormData(form);
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending…';

      // Start the email independently so spreadsheet delays or failures cannot
      // prevent the club from receiving the submitted registration details.
      const emailPromise = fetch(`https://formsubmit.co/ajax/${email}`, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: data
        }).then(r => {
          if (!r.ok) throw new Error(`Email service returned HTTP ${r.status}`);
          return true;
        }).catch(error => {
          console.error('Form email submission failed:', error);
          return false;
        });

      // Google Forms no-cors responses are opaque: a resolved request only
      // means it was dispatched, not that the row is visible in the sheet.
      const sheetPromise = form.dataset.gform
        ? (() => {
          const params = new URLSearchParams();
          form.querySelectorAll('[data-entry]').forEach(el => {
            if (el.name && el.value !== '') params.set('entry.' + el.dataset.entry, el.value);
          });
          return fetch(form.dataset.gform, { method: 'POST', mode: 'no-cors', body: params })
            .then(() => true)
            .catch(error => {
              console.error('Google Form submission failed:', error);
              return false;
            });
        })()
        : Promise.resolve(null);

      const [emailSent, gformSent] = await Promise.all([emailPromise, sheetPromise]);

      if (emailSent && gformSent !== false) {
        status.className = 'form-status ok';
        status.textContent = form.dataset.success || 'Thank you! We will be in touch shortly.';
        form.reset();
        form.querySelectorAll('[data-total]').forEach(t => t.textContent = '1');
        form.querySelectorAll('[data-total-veg]').forEach(t => t.textContent = '0');
      } else if (emailSent) {
        status.className = 'form-status err';
        status.textContent = 'Your registration was emailed to the club, but we could not send it to the spreadsheet. Please contact us to confirm it has been recorded.';
        form.reset();
        form.querySelectorAll('[data-total]').forEach(t => t.textContent = '1');
        form.querySelectorAll('[data-total-veg]').forEach(t => t.textContent = '0');
      } else if (gformSent === true) {
        status.className = 'form-status err';
        status.textContent = 'The spreadsheet request was sent, but we could not confirm the club email. Please contact us directly to make sure your registration is received.';
      } else {
        status.className = 'form-status err';
        status.textContent = 'Sorry — we could not confirm that your registration reached the club. Your details are still here; please email us directly before trying again.';
      }
      btn.disabled = false; btn.textContent = btn.dataset.label || 'Submit';
    });
  });

  // Party form: live totals + veg-can't-exceed-group check
  const party = document.querySelector('form[data-gform]');
  if (party) {
    const groups = [['adults','adults-veg'],['kids','kids-veg'],['u5','u5-veg']];
    const recalc = () => {
      let total = 0, veg = 0;
      groups.forEach(([g, v]) => {
        const gi = party.querySelector('#' + g), vi = party.querySelector('#' + v);
        const gn = Math.max(0, +gi.value || 0);
        if (+vi.value > gn) vi.value = gn;
        total += gn; veg += Math.max(0, +vi.value || 0);
      });
      party.querySelectorAll('[data-total]').forEach(t => t.textContent = total);
      party.querySelectorAll('[data-total-veg]').forEach(t => t.textContent = veg);
    };
    party.addEventListener('input', recalc);
    recalc();
  }
});
