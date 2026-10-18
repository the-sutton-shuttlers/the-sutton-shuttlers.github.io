// Mobile nav
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle) toggle.addEventListener('click', () => links.classList.toggle('open'));

  // Lightbox
  const lb = document.querySelector('.lightbox');
  if (lb) {
    document.querySelectorAll('.gallery img').forEach(img => {
      img.addEventListener('click', () => {
        lb.querySelector('img').src = img.src;
        lb.classList.add('open');
      });
    });
    lb.addEventListener('click', () => lb.classList.remove('open'));
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

      // Google Form → Sheet write (no-cors: Forms returns an opaque response;
      // the FormSubmit email below is the confirmation that data was captured)
      if (form.dataset.gform) {
        try {
          const params = new URLSearchParams();
          form.querySelectorAll('[data-entry]').forEach(el => {
            if (el.name && el.value !== '') params.set('entry.' + el.dataset.entry, el.value);
          });
          fetch(form.dataset.gform, { method: 'POST', mode: 'no-cors', body: params }).catch(() => {});
        } catch {}
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
        status.className = 'form-status err';
        status.textContent = 'Sorry — something went wrong. Please email us directly or try again.';
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
