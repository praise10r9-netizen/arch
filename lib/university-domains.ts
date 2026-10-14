import 'server-only';

const ACADEMIC_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ac\.mw$/;

export function normalizeAcademicDomain(value: string): string | null {
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  return domain.length <= 253 && ACADEMIC_DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function getAcademicEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  return normalizeAcademicDomain(email.slice(at + 1));
}