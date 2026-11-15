// Only explanatory copy is marked; live values, errors and action results stay in place.
export function mountDescriptionNotes(root) {
  const notes = new Map();
  const pending = new Set();
  let frame = null;
  let activeDialog = null;
  let activeRecord = null;

  function openDescription(record) {
    activeDialog?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'training-help-dialog site-description-dialog';
    dialog.setAttribute('aria-labelledby', 'site-description-title');
    const heading = document.createElement('div');
    heading.className = 'roster-heading';
    const title = document.createElement('h2');
    title.id = 'site-description-title';
    title.textContent = record.source.dataset.description;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'button secondary';
    close.textContent = '닫기';
    close.autofocus = true;
    close.addEventListener('click', () => dialog.close());
    heading.append(title, close);
    const content = document.createElement('div');
    content.className = 'training-help-content site-description-content';
    const source = record.source;
    if (source.matches('p, span') && !source.childElementCount) {
      for (const sentence of source.textContent.trim().split(/(?<=[.!?。])\s+/u)) {
        const paragraph = document.createElement('p');
        paragraph.textContent = sentence;
        content.append(paragraph);
      }
    } else {
      const copy = source.cloneNode(true);
      for (const element of [copy, ...copy.querySelectorAll('*')]) {
        element.removeAttribute('id');
        element.removeAttribute('data-description');
        element.removeAttribute('data-description-scope');
        element.removeAttribute('aria-hidden');
        element.classList.remove('site-description-source');
      }
      if (copy.tagName === 'DETAILS') {
        copy.querySelector(':scope > summary')?.remove();
        content.append(...copy.childNodes);
      } else content.append(copy);
    }
    dialog.append(heading, content);
    dialog.addEventListener('cancel', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
      if (globalThis.CSS?.supports('transition-behavior', 'allow-discrete')) setTimeout(() => dialog.remove(), 140); else dialog.remove();
      if (activeDialog === dialog) { activeDialog = null; activeRecord = null; }
      if (record.button.isConnected && !record.button.hidden) record.button.focus({ preventScroll: true });
    }, { once: true });
    root.append(dialog);
    activeDialog = dialog;
    activeRecord = record;
    dialog.showModal();
  }

  function refresh(record) {
    const { source, note, button } = record;
    const empty = !source.textContent.trim();
    const hidden = source.hidden || empty;
    if (note.hidden !== hidden) note.hidden = hidden;
    const footer = note.parentElement;
    const footerHidden = [...footer.children].every(child => child.hidden);
    if (footer.hidden !== footerHidden) footer.hidden = footerHidden;
    if (hidden || !note.getClientRects().length || !note.clientWidth) return;
    // The source retains the footer's full width even when shown through a dialog.
    const lineHeight = Number.parseFloat(getComputedStyle(source).lineHeight);
    const lines = Math.ceil((source.getBoundingClientRect().height - 1) / lineHeight);
    const long = lines >= 3;
    note.classList.toggle('has-description-dialog', long);
    source.setAttribute('aria-hidden', String(long));
    if (button.hidden !== !long) button.hidden = !long;
  }

  function schedule(record) {
    if (record) pending.add(record);
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      for (const [source, current] of notes) {
        if (source.isConnected) continue;
        if (current === activeRecord) activeDialog?.close();
        resize.unobserve(current.note);
        notes.delete(source);
        pending.delete(current);
      }
      for (const current of pending) refresh(current);
      pending.clear();
    });
  }

  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      const source = entry.target.querySelector(':scope > [data-description]');
      schedule(notes.get(source));
    }
  });

  function register(source) {
    if (notes.has(source)) return;
    // Result windows may copy a previously rendered panel. Rebuild its buttons/listeners.
    const previous = source.parentElement.closest('.site-description-note');
    const scope = source.closest('[data-description-scope], .transfer-negotiation, article, .panel, dialog, .sponsor-contracts, .menu-copy, .journey, .practice-settings, .practice-controls, .page-heading')
      ?? (previous ? previous.parentElement.parentElement : source.parentElement);
    let footer = [...scope.children].find(child => child.classList.contains('site-description-footer'));
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'site-description-footer';
      scope.append(footer);
    }
    const note = document.createElement('div');
    note.className = 'site-description-note';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary site-description-button';
    button.textContent = `${source.dataset.description} 설명`;
    button.setAttribute('aria-haspopup', 'dialog');
    button.hidden = true;
    source.classList.add('site-description-source');
    if (source.tagName === 'DETAILS') source.open = true;
    note.append(source, button);
    footer.append(note);
    previous?.remove();
    const record = { source, note, button };
    notes.set(source, record);
    button.addEventListener('click', () => openDescription(record));
    resize.observe(note);
    schedule(record);
  }

  function discover(element) {
    if (!(element instanceof Element)) return;
    if (element.matches('[data-description]')) register(element);
    for (const source of element.querySelectorAll('[data-description]')) register(source);
  }

  const mutations = new MutationObserver(entries => {
    for (const entry of entries) {
      const element = entry.target instanceof Element ? entry.target : entry.target.parentElement;
      const source = element?.closest('[data-description]');
      if (source) schedule(notes.get(source));
      if (entry.type === 'childList') {
        for (const node of entry.addedNodes) discover(node);
        if (entry.removedNodes.length) schedule();
      } else if (entry.type === 'attributes') {
        // Hidden tabs, settings and dialogs are measured when they become visible.
        for (const nested of element.querySelectorAll('[data-description]')) schedule(notes.get(nested));
      }
    }
  });
  discover(root);
  mutations.observe(root, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['hidden', 'open'] });
  return () => {
    mutations.disconnect();
    resize.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    activeDialog?.close();
  };
}

