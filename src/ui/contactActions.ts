import { SITE, isDivisionId, getDivision } from '../config/site.ts';
import { buildVCard, enquirySubject, mailtoHref } from '../core/contact.ts';

/**
 * Contact actions — copy address, save vCard, compose an email to a division.
 * All client-side: nothing is sent anywhere by the site itself.
 */
export function bindContactActions(siteUrl: string): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const original = btn.textContent ?? '';
    // role="status" sibling: button label changes are not re-announced by NVDA/JAWS (WCAG 4.1.3).
    const status = btn.parentElement?.querySelector<HTMLElement>('[data-copy-status]') ?? null;
    const address = btn.parentElement?.querySelector<HTMLElement>('.contact__big') ?? null;
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copy ?? '';
      let ok = false;
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        ok = false; // Clipboard API blocked (insecure context / permission) — fall back to a selection.
      }
      if (!ok && address) window.getSelection()?.selectAllChildren(address); // makes the ⌘/Ctrl+C hint true
      btn.textContent = ok ? 'Copied ✓' : 'Selected — press ⌘/Ctrl + C';
      if (status) status.textContent = ok ? 'Email address copied' : 'Email address selected. Press Control or Command plus C to copy.';
      window.setTimeout(() => {
        btn.textContent = original;
        if (status) status.textContent = '';
      }, 2600);
    });
  }

  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-vcard]')) {
    btn.addEventListener('click', () => {
      const blob = new Blob([buildVCard(siteUrl || undefined)], { type: 'text/vcard;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${SITE.company.brand}.vcf`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const composer = document.querySelector<HTMLFormElement>('[data-composer]');
  const submit = composer?.querySelector<HTMLButtonElement>('[data-composer-submit]');
  if (!composer || !submit) return;

  const topic = (): string => new FormData(composer).get('topic')?.toString() ?? '';
  const label = (): void => {
    const t = topic();
    const name = isDivisionId(t) ? getDivision(t).name : null;
    submit.firstChild!.textContent = name ? `Write to ${name}` : 'Compose email';
  };
  composer.addEventListener('change', label);
  label(); // browsers restore a checked radio after reload — keep the button text in sync with it
  window.addEventListener('pageshow', label); // …and after back/forward-cache restores
  composer.addEventListener('submit', (e) => {
    e.preventDefault(); // CSP form-action 'none' would block a real submission anyway.
    const t = topic();
    const division = isDivisionId(t) ? getDivision(t) : null;
    window.location.href = mailtoHref(SITE.contact.email, enquirySubject(division));
  });
}
