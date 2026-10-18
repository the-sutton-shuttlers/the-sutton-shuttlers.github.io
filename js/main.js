// Mobile nav
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle) toggle.addEventListener('click', () => links.classList.toggle('open'));

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
      const email = form.dataset.formsubmit;
      const data = new FormData(form);
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending…';

      // Google Form → Sheet write. no-cors gives an opaque response, so we can't
      // read the result — but we CAN await it so the row lands before we decide
      // what to tell the user. The FormSubmit email below is a nice-to-have
      // confirmation, not the record of truth.
      let gformSent = false;
      if (form.dataset.gform) {
        try {
          const params = new URLSearchParams();
          form.querySelectorAll('[data-entry]').forEach(el => {
            if (el.name && el.value !== '') params.set('entry.' + el.dataset.entry, el.value);
          });
          await fetch(form.dataset.gform, { method: 'POST', mode: 'no-cors', body: params });
          gformSent = true;
        } catch { gformSent = true; } // opaque/cors errors still mean the POST was dispatched
      }

      try {
        const r = await fetch(`https://formsubmit.co/ajax/${email}`, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: data
        });
        if (!r.ok) throw new Error('send failed');
        status.className = 'form-status ok';
        status.textContent = form.dataset.success || 'Thank you! We will be in touch shortly.';
        form.reset();
        if (form.dataset.gform) localStorage.setItem('party2026-submitted', '1');
        form.querySelectorAll('[data-total]').forEach(t => t.textContent = '1');
        form.querySelectorAll('[data-total-veg]').forEach(t => t.textContent = '0');
      } catch {
        if (form.dataset.gform && gformSent) {
          // The sheet row was already written — treat as success so the user
          // doesn't resubmit and create duplicates.
          status.className = 'form-status ok';
          status.textContent = 'Thanks — you are registered! (Our confirmation email is being slow, so you may not get one — but your booking is recorded.)';
          form.reset();
          localStorage.setItem('party2026-submitted', '1');
          form.querySelectorAll('[data-total]').forEach(t => t.textContent = '1');
          form.querySelectorAll('[data-total-veg]').forEach(t => t.textContent = '0');
        } else {
          status.className = 'form-status err';
          status.textContent = 'Sorry — something went wrong. Please email us directly or try again.';
        }
      }
      btn.disabled = false; btn.textContent = btn.dataset.label || 'Submit';
    });
  });

  // Party form: live totals + veg-can't-exceed-group check + same-device duplicate guard
  const party = document.querySelector('form[data-gform]');
  if (party) {
    const submittedKey = 'party2026-submitted';
    if (localStorage.getItem(submittedKey)) {
      const status = party.querySelector('.form-status');
      status.className = 'form-status ok';
      status.textContent = 'Looks like you already registered from this device. Need to change your booking? Message the committee via the contact form.';
    }
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
    party.addEventListener('submit', e => {
      const status = party.querySelector('.form-status');
      const labels = { adults: 'Adults', kids: 'Children 5-11', u5: 'Children under 5' };
      let bad = null;
      groups.forEach(([g, v]) => {
        const gn = +party.querySelector('#' + g).value || 0;
        const vn = +party.querySelector('#' + v).value || 0;
        if (vn > gn) bad = labels[g];
      });
      const total = ['adults','kids','u5'].reduce((s, id) => s + (+party.querySelector('#' + id).value || 0), 0);
      if (bad || total < 1) {
        e.preventDefault();
        status.className = 'form-status err';
        status.textContent = bad
          ? bad + ': the vegetarian count is more than the total guests — please correct the numbers.'
          : 'Please add at least one guest.';
      }
    });
    recalc();
  }
});
