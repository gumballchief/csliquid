const CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  return '1'.repeat(zeros) + digits.reverse().map(d => CHARS[d]).join('');
}

export function decodeBase58(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  const bytes = [0];
  for (const c of str.slice(zeros)) {
    const val = CHARS.indexOf(c);
    if (val < 0) throw new Error(`Invalid base58 character: ${c}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes.reverse()]);
}
