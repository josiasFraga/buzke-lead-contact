function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function normalizePhone(rawPhone: string | null | undefined) {
  if (!rawPhone) {
    return null;
  }

  let digits = digitsOnly(rawPhone);

  if (!digits) {
    return null;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  if (digits.length < 12 || digits.length > 13) {
    return null;
  }

  if (!digits.startsWith('55')) {
    return digits;
  }

  const local = digits.slice(2);
  if (local.length === 10 || local.length === 11) {
    return digits;
  }

  return null;
}

export function buildPhoneCandidates(rawPhone: string | null | undefined) {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();
  candidates.add(normalized);

  if (normalized.startsWith('55')) {
    const local = normalized.slice(2);
    candidates.add(local);

    if (local.length === 11) {
      candidates.add(`55${local.slice(0, 2)}${local.slice(3)}`);
      candidates.add(`${local.slice(0, 2)}${local.slice(3)}`);
    }

    if (local.length === 10) {
      candidates.add(`55${local.slice(0, 2)}9${local.slice(2)}`);
      candidates.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
  }

  return [...candidates];
}

export function jidToPhone(jid: string) {
  return digitsOnly(jid.split('@')[0]);
}